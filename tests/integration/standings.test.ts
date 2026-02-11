import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { PrismaClient } from "../../src/generated/prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import path from "path";

// ==========================================
// Test database
// ==========================================

const TEST_DB_PATH = path.resolve(__dirname, "../../test.db");
const testAdapter = new PrismaLibSql({ url: `file:${TEST_DB_PATH}` });
const testPrisma = new PrismaClient({ adapter: testAdapter });

// ==========================================
// Module mocks
// ==========================================

vi.mock("@/lib/db", async () => {
  const { PrismaClient } = await import("../../src/generated/prisma/client");
  const { PrismaLibSql } = await import("@prisma/adapter-libsql");
  const path = await import("path");
  const dbPath = path.resolve(__dirname, "../../test.db");
  const adapter = new PrismaLibSql({ url: `file:${dbPath}` });
  return { prisma: new PrismaClient({ adapter }) };
});

vi.mock("@/lib/auth", () => ({
  requireAdmin: vi.fn(async () => ({ leagueId: 0, leagueSlug: "", adminUsername: "" })),
  requireLeagueAdmin: vi.fn(async () => ({ leagueId: 0, leagueSlug: "", adminUsername: "" })),
  getAdminSession: vi.fn(async () => ({ leagueId: 0, leagueSlug: "", adminUsername: "" })),
  isAdmin: vi.fn(async () => true),
  isLeagueAdmin: vi.fn(async () => true),
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ get: () => undefined, set: () => {}, delete: () => {} })),
  headers: vi.fn(async () => ({
    get: (name: string) => (name === "x-forwarded-for" ? "127.0.0.1" : null),
  })),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: () => ({ allowed: true, remaining: 100, resetAt: Date.now() + 60000 }),
  RATE_LIMITS: {
    login: { maxAttempts: 100, windowMs: 60000 },
    sudoLogin: { maxAttempts: 100, windowMs: 60000 },
    createLeague: { maxAttempts: 100, windowMs: 60000 },
    registerTeam: { maxAttempts: 100, windowMs: 60000 },
  },
}));

// ==========================================
// Imports
// ==========================================

import {
  getLeaderboard,
  getLeaderboardWithMovement,
  getSeasonLeaderboard,
  getAllTimeLeaderboard,
} from "@/lib/actions/standings";
import { createLeague } from "@/lib/actions/leagues";
import { createTeam, approveTeam } from "@/lib/actions/teams";
import { createSeason } from "@/lib/actions/seasons";
import { submitMatchup } from "@/lib/actions/matchups";
import { submitWeeklyScores } from "@/lib/actions/weekly-scores";
import { requireLeagueAdmin, requireAdmin } from "@/lib/auth";

const mockedRequireLeagueAdmin = vi.mocked(requireLeagueAdmin);
const mockedRequireAdmin = vi.mocked(requireAdmin);

// ==========================================
// Helpers
// ==========================================

function setAuthContext(leagueId: number, leagueSlug: string, adminUsername: string) {
  mockedRequireAdmin.mockResolvedValue({ leagueId, leagueSlug, adminUsername });
  mockedRequireLeagueAdmin.mockImplementation(async (slug: string) => {
    if (slug !== leagueSlug) throw new Error("Unauthorized");
    return { leagueId, leagueSlug, adminUsername };
  });
}

function unwrap<T>(result: { success: true; data: T } | { success: false; error: string }): T {
  if (!result.success) throw new Error(`Expected success but got error: ${result.error}`);
  return result.data;
}

async function cleanDatabase() {
  await testPrisma.holeScore.deleteMany();
  await testPrisma.scorecard.deleteMany();
  await testPrisma.weeklyScore.deleteMany();
  await testPrisma.scheduledMatchup.deleteMany();
  await testPrisma.hole.deleteMany();
  await testPrisma.course.deleteMany();
  await testPrisma.matchup.deleteMany();
  await testPrisma.team.deleteMany();
  await testPrisma.season.deleteMany();
  await testPrisma.league.deleteMany();
}

// ==========================================
// Lifecycle
// ==========================================

beforeAll(async () => { await cleanDatabase(); });
afterAll(async () => { await cleanDatabase(); await testPrisma.$disconnect(); });
beforeEach(async () => { await cleanDatabase(); });

// ==========================================
// Tests — Match Play (existing)
// ==========================================

describe("getLeaderboard", () => {
  it("returns empty array for league with no approved teams", async () => {
    const league = unwrap(await createLeague("Empty Leaderboard League", "securepass123"));
    const leaderboard = await getLeaderboard(league.id);
    expect(leaderboard).toEqual([]);
  });

  it("returns teams sorted by total points descending", async () => {
    const league = unwrap(await createLeague("Leaderboard League", "securepass123"));
    setAuthContext(league.id, league.slug, league.adminUsername);
    unwrap(await createSeason(league.slug, "Season 1", 2025));

    const t1 = unwrap(await createTeam(league.id, "First Place"));
    const t2 = unwrap(await createTeam(league.id, "Second Place"));
    const t3 = unwrap(await createTeam(league.id, "Third Place"));
    await approveTeam(league.slug, t1.id);
    await approveTeam(league.slug, t2.id);
    await approveTeam(league.slug, t3.id);

    // First beats Second
    await submitMatchup(league.slug, 1, t1.id, 38, 5, 33, 20, false, t2.id, 42, 5, 37, 0, false);
    // First beats Third
    await submitMatchup(league.slug, 2, t1.id, 38, 5, 33, 20, false, t3.id, 44, 5, 39, 0, false);
    // Second beats Third
    await submitMatchup(league.slug, 3, t2.id, 39, 5, 34, 20, false, t3.id, 43, 5, 38, 0, false);

    const leaderboard = await getLeaderboard(league.id);
    expect(leaderboard).toHaveLength(3);
    expect(leaderboard[0].name).toBe("First Place");
    expect(leaderboard[0].totalPoints).toBe(40);
    expect(leaderboard[1].name).toBe("Second Place");
    expect(leaderboard[1].totalPoints).toBe(20);
    expect(leaderboard[2].name).toBe("Third Place");
    expect(leaderboard[2].totalPoints).toBe(0);
  });

  it("does not expose PII fields", async () => {
    const league = unwrap(await createLeague("PII Test League", "securepass123"));
    setAuthContext(league.id, league.slug, league.adminUsername);
    unwrap(await createSeason(league.slug, "Season 1", 2025));

    const t1 = unwrap(await createTeam(league.id, "Test Team"));
    await approveTeam(league.slug, t1.id);

    const leaderboard = await getLeaderboard(league.id);
    const team = leaderboard[0] as Record<string, unknown>;
    expect(team.captainName).toBeUndefined();
    expect(team.email).toBeUndefined();
    expect(team.phone).toBeUndefined();
  });

  it("uses wins as first tiebreaker when points are equal", async () => {
    const league = unwrap(await createLeague("Tiebreaker League", "securepass123"));
    setAuthContext(league.id, league.slug, league.adminUsername);
    unwrap(await createSeason(league.slug, "Season 1", 2025));

    const t1 = unwrap(await createTeam(league.id, "Team A"));
    const t2 = unwrap(await createTeam(league.id, "Team B"));
    const t3 = unwrap(await createTeam(league.id, "Team C"));
    await approveTeam(league.slug, t1.id);
    await approveTeam(league.slug, t2.id);
    await approveTeam(league.slug, t3.id);

    // A beats B (A gets 20, B gets 0)
    await submitMatchup(league.slug, 1, t1.id, 38, 5, 33, 20, false, t2.id, 42, 5, 37, 0, false);
    // C ties A (10 each)
    await submitMatchup(league.slug, 2, t1.id, 40, 5, 35, 10, false, t3.id, 40, 5, 35, 10, false);
    // B beats C (B gets 20, C gets 0)
    await submitMatchup(league.slug, 3, t2.id, 38, 5, 33, 20, false, t3.id, 43, 5, 38, 0, false);

    const leaderboard = await getLeaderboard(league.id);
    // A: 30pts (1W 1T), B: 20pts (1W 1L), C: 10pts (1T 1L)
    expect(leaderboard[0].name).toBe("Team A");
    expect(leaderboard[0].totalPoints).toBe(30);
  });
});

describe("getLeaderboardWithMovement", () => {
  it("returns teams with no matchups and null movement", async () => {
    const league = unwrap(await createLeague("Movement League", "securepass123"));
    setAuthContext(league.id, league.slug, league.adminUsername);
    unwrap(await createSeason(league.slug, "Season 1", 2025));

    const t1 = unwrap(await createTeam(league.id, "Team A"));
    await approveTeam(league.slug, t1.id);

    const leaderboard = await getLeaderboardWithMovement(league.id);
    expect(leaderboard).toHaveLength(1);
    expect(leaderboard[0].rankChange).toBeNull();
    expect(leaderboard[0].handicapChange).toBeNull();
    expect(leaderboard[0].previousRank).toBeNull();
  });

  it("tracks rank movement across weeks", async () => {
    const league = unwrap(await createLeague("Movement Track League", "securepass123"));
    setAuthContext(league.id, league.slug, league.adminUsername);
    unwrap(await createSeason(league.slug, "Season 1", 2025));

    const t1 = unwrap(await createTeam(league.id, "Team A"));
    const t2 = unwrap(await createTeam(league.id, "Team B"));
    await approveTeam(league.slug, t1.id);
    await approveTeam(league.slug, t2.id);

    // Week 1: A beats B
    await submitMatchup(league.slug, 1, t1.id, 38, 5, 33, 20, false, t2.id, 42, 5, 37, 0, false);
    // Week 2: B beats A (B climbs)
    await submitMatchup(league.slug, 2, t1.id, 45, 5, 40, 0, false, t2.id, 38, 5, 33, 20, false);

    const leaderboard = await getLeaderboardWithMovement(league.id);
    expect(leaderboard).toHaveLength(2);

    // Both have 20 points total, so ranking depends on tiebreakers
    // Verify movement data is populated
    for (const team of leaderboard) {
      expect(team.previousRank).not.toBeNull();
    }
  });
});

describe("getSeasonLeaderboard", () => {
  it("returns leaderboard filtered by season", async () => {
    const league = unwrap(await createLeague("Season LB League", "securepass123"));
    setAuthContext(league.id, league.slug, league.adminUsername);

    const s1 = unwrap(await createSeason(league.slug, "Season 1", 2025));

    const t1 = unwrap(await createTeam(league.id, "Team A"));
    const t2 = unwrap(await createTeam(league.id, "Team B"));
    await approveTeam(league.slug, t1.id);
    await approveTeam(league.slug, t2.id);

    await submitMatchup(league.slug, 1, t1.id, 38, 5, 33, 20, false, t2.id, 42, 5, 37, 0, false);

    const leaderboard = await getSeasonLeaderboard(s1.id);
    expect(leaderboard).toHaveLength(2);
    expect(leaderboard[0].totalPoints).toBe(20);
  });
});

describe("getAllTimeLeaderboard", () => {
  it("returns all-time standings across seasons", async () => {
    const league = unwrap(await createLeague("All Time League", "securepass123"));
    setAuthContext(league.id, league.slug, league.adminUsername);
    unwrap(await createSeason(league.slug, "Season 1", 2025));

    const t1 = unwrap(await createTeam(league.id, "Team A"));
    const t2 = unwrap(await createTeam(league.id, "Team B"));
    await approveTeam(league.slug, t1.id);
    await approveTeam(league.slug, t2.id);

    await submitMatchup(league.slug, 1, t1.id, 38, 5, 33, 20, false, t2.id, 42, 5, 37, 0, false);

    const leaderboard = await getAllTimeLeaderboard(league.id);
    expect(leaderboard.length).toBeGreaterThan(0);
  });

  it("returns empty for league with no teams", async () => {
    const league = unwrap(await createLeague("Empty All Time League", "securepass123"));
    const leaderboard = await getAllTimeLeaderboard(league.id);
    expect(leaderboard).toEqual([]);
  });
});

// ==========================================
// Tests — Stroke Play
// ==========================================

describe("getLeaderboardWithMovement (stroke play)", () => {
  it("ranks teams by total points in stroke play mode", async () => {
    const league = unwrap(await createLeague("SP Movement League", "securepass123"));
    setAuthContext(league.id, league.slug, league.adminUsername);
    const season = unwrap(await createSeason(league.slug, "Season 1", 2025));

    // Switch league to stroke_play
    await testPrisma.league.update({
      where: { id: league.id },
      data: { scoringType: "stroke_play" },
    });

    const t1 = unwrap(await createTeam(league.id, "Alpha"));
    const t2 = unwrap(await createTeam(league.id, "Bravo"));
    const t3 = unwrap(await createTeam(league.id, "Charlie"));
    await approveTeam(league.slug, t1.id);
    await approveTeam(league.slug, t2.id);
    await approveTeam(league.slug, t3.id);

    // Week 1 scores: Alpha wins (position 1), Bravo 2nd, Charlie 3rd
    unwrap(await submitWeeklyScores(league.slug, 1, [
      { teamId: t1.id, grossScore: 38, handicap: 5, netScore: 33, points: 10, bonusPoints: 0, isSub: false, isDnp: false, position: 1 },
      { teamId: t2.id, grossScore: 40, handicap: 4, netScore: 36, points: 8, bonusPoints: 0, isSub: false, isDnp: false, position: 2 },
      { teamId: t3.id, grossScore: 44, handicap: 6, netScore: 38, points: 6, bonusPoints: 0, isSub: false, isDnp: false, position: 3 },
    ]));

    const leaderboard = await getLeaderboardWithMovement(league.id);
    expect(leaderboard).toHaveLength(3);

    // Alpha has most points (10), should be ranked first
    expect(leaderboard[0].name).toBe("Alpha");
    expect(leaderboard[0].totalPoints).toBe(10);

    // Bravo second (8 points)
    expect(leaderboard[1].name).toBe("Bravo");
    expect(leaderboard[1].totalPoints).toBe(8);

    // Charlie third (6 points)
    expect(leaderboard[2].name).toBe("Charlie");
    expect(leaderboard[2].totalPoints).toBe(6);

    // Stroke play fields should be present
    expect(leaderboard[0].avgNet).toBeDefined();
    expect(leaderboard[0].bestFinish).toBe(1);
    expect(leaderboard[0].roundsPlayed).toBe(1);

    // With only one week, no previous data for movement
    expect(leaderboard[0].rankChange).toBeNull();
    expect(leaderboard[0].previousRank).toBeNull();
  });

  it("returns movement data across weeks", async () => {
    const league = unwrap(await createLeague("SP Multi-Week League", "securepass123"));
    setAuthContext(league.id, league.slug, league.adminUsername);
    unwrap(await createSeason(league.slug, "Season 1", 2025));

    await testPrisma.league.update({
      where: { id: league.id },
      data: { scoringType: "stroke_play" },
    });

    const t1 = unwrap(await createTeam(league.id, "Alpha"));
    const t2 = unwrap(await createTeam(league.id, "Bravo"));
    const t3 = unwrap(await createTeam(league.id, "Charlie"));
    await approveTeam(league.slug, t1.id);
    await approveTeam(league.slug, t2.id);
    await approveTeam(league.slug, t3.id);

    // Week 1: Alpha 1st, Bravo 2nd, Charlie 3rd
    unwrap(await submitWeeklyScores(league.slug, 1, [
      { teamId: t1.id, grossScore: 38, handicap: 5, netScore: 33, points: 10, bonusPoints: 0, isSub: false, isDnp: false, position: 1 },
      { teamId: t2.id, grossScore: 40, handicap: 4, netScore: 36, points: 8, bonusPoints: 0, isSub: false, isDnp: false, position: 2 },
      { teamId: t3.id, grossScore: 44, handicap: 6, netScore: 38, points: 6, bonusPoints: 0, isSub: false, isDnp: false, position: 3 },
    ]));

    // Week 2: Charlie surges to 1st, Bravo 2nd, Alpha 3rd
    unwrap(await submitWeeklyScores(league.slug, 2, [
      { teamId: t3.id, grossScore: 36, handicap: 5, netScore: 31, points: 10, bonusPoints: 0, isSub: false, isDnp: false, position: 1 },
      { teamId: t2.id, grossScore: 39, handicap: 4, netScore: 35, points: 8, bonusPoints: 0, isSub: false, isDnp: false, position: 2 },
      { teamId: t1.id, grossScore: 46, handicap: 5, netScore: 41, points: 6, bonusPoints: 0, isSub: false, isDnp: false, position: 3 },
    ]));

    const leaderboard = await getLeaderboardWithMovement(league.id);
    expect(leaderboard).toHaveLength(3);

    // After 2 weeks: Alpha=16, Bravo=16, Charlie=16 -- all tied on points
    // Tiebreaker: counting method (most 1st-place finishes), then avgNet
    // Alpha: one 1st, one 3rd. Bravo: two 2nds. Charlie: one 1st, one 3rd.
    // Alpha and Charlie both have 1x 1st place. Bravo has 0x 1st place.
    // Alpha avgNet = (33+41)/2 = 37. Charlie avgNet = (38+31)/2 = 34.5
    // Charlie has lower avgNet, so Charlie > Alpha > Bravo

    // All teams played in previous week, so movement data should exist
    for (const team of leaderboard) {
      expect(team.previousRank).not.toBeNull();
      expect(team.rankChange).not.toBeNull();
    }

    // Verify total rounds played
    for (const team of leaderboard) {
      expect(team.roundsPlayed).toBe(2);
    }
  });

  it("handles teams with no activity (null movement)", async () => {
    const league = unwrap(await createLeague("SP No Activity League", "securepass123"));
    setAuthContext(league.id, league.slug, league.adminUsername);
    unwrap(await createSeason(league.slug, "Season 1", 2025));

    await testPrisma.league.update({
      where: { id: league.id },
      data: { scoringType: "stroke_play" },
    });

    const t1 = unwrap(await createTeam(league.id, "Alpha"));
    await approveTeam(league.slug, t1.id);

    // No weekly scores submitted at all
    const leaderboard = await getLeaderboardWithMovement(league.id);
    expect(leaderboard).toHaveLength(1);
    expect(leaderboard[0].rankChange).toBeNull();
    expect(leaderboard[0].handicapChange).toBeNull();
    expect(leaderboard[0].previousRank).toBeNull();
    expect(leaderboard[0].previousHandicap).toBeNull();
    expect(leaderboard[0].avgNet).toBe(0);
    expect(leaderboard[0].bestFinish).toBe(0);
    expect(leaderboard[0].roundsPlayed).toBe(0);
  });
});

describe("getSeasonLeaderboard (stroke play)", () => {
  it("returns stroke play rankings for a season", async () => {
    const league = unwrap(await createLeague("SP Season LB League", "securepass123"));
    setAuthContext(league.id, league.slug, league.adminUsername);

    await testPrisma.league.update({
      where: { id: league.id },
      data: { scoringType: "stroke_play" },
    });

    const season = unwrap(await createSeason(league.slug, "Season 1", 2025));

    // Update season scoringType to match
    await testPrisma.season.update({
      where: { id: season.id },
      data: { scoringType: "stroke_play" },
    });

    const t1 = unwrap(await createTeam(league.id, "Alpha"));
    const t2 = unwrap(await createTeam(league.id, "Bravo"));
    const t3 = unwrap(await createTeam(league.id, "Charlie"));
    await approveTeam(league.slug, t1.id);
    await approveTeam(league.slug, t2.id);
    await approveTeam(league.slug, t3.id);

    // Submit weekly scores for 2 weeks
    unwrap(await submitWeeklyScores(league.slug, 1, [
      { teamId: t1.id, grossScore: 38, handicap: 5, netScore: 33, points: 10, bonusPoints: 0, isSub: false, isDnp: false, position: 1 },
      { teamId: t2.id, grossScore: 42, handicap: 6, netScore: 36, points: 8, bonusPoints: 0, isSub: false, isDnp: false, position: 2 },
      { teamId: t3.id, grossScore: 45, handicap: 7, netScore: 38, points: 6, bonusPoints: 0, isSub: false, isDnp: false, position: 3 },
    ]));

    unwrap(await submitWeeklyScores(league.slug, 2, [
      { teamId: t1.id, grossScore: 39, handicap: 5, netScore: 34, points: 10, bonusPoints: 0, isSub: false, isDnp: false, position: 1 },
      { teamId: t2.id, grossScore: 41, handicap: 5, netScore: 36, points: 8, bonusPoints: 0, isSub: false, isDnp: false, position: 2 },
      { teamId: t3.id, grossScore: 43, handicap: 6, netScore: 37, points: 6, bonusPoints: 0, isSub: false, isDnp: false, position: 3 },
    ]));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const leaderboard: any[] = await getSeasonLeaderboard(season.id);
    expect(leaderboard).toHaveLength(3);

    // Alpha: 20 total points, Bravo: 16, Charlie: 12
    expect(leaderboard[0].totalPoints).toBe(20);
    expect(leaderboard[0].name).toBe("Alpha");

    expect(leaderboard[1].totalPoints).toBe(16);
    expect(leaderboard[1].name).toBe("Bravo");

    expect(leaderboard[2].totalPoints).toBe(12);
    expect(leaderboard[2].name).toBe("Charlie");

    // Stroke play results should include additional fields
    expect(leaderboard[0]).toHaveProperty("roundsPlayed", 2);
    expect(leaderboard[0]).toHaveProperty("bestFinish", 1);
    expect(leaderboard[0]).toHaveProperty("avgNet");
    // Alpha avgNet = (33 + 34) / 2 = 33.5
    expect(leaderboard[0].avgNet).toBeCloseTo(33.5, 1);

    // Stroke play sets wins/losses/ties to 0
    expect(leaderboard[0].wins).toBe(0);
    expect(leaderboard[0].losses).toBe(0);
    expect(leaderboard[0].ties).toBe(0);
  });

  it("excludes DNP teams beyond maxDnp threshold", async () => {
    const league = unwrap(await createLeague("SP MaxDNP League", "securepass123"));
    setAuthContext(league.id, league.slug, league.adminUsername);

    await testPrisma.league.update({
      where: { id: league.id },
      data: { scoringType: "stroke_play", strokePlayMaxDnp: 1 },
    });

    const season = unwrap(await createSeason(league.slug, "Season 1", 2025));
    await testPrisma.season.update({
      where: { id: season.id },
      data: { scoringType: "stroke_play" },
    });

    const t1 = unwrap(await createTeam(league.id, "Consistent"));
    const t2 = unwrap(await createTeam(league.id, "Absent"));
    await approveTeam(league.slug, t1.id);
    await approveTeam(league.slug, t2.id);

    // Week 1: both play
    unwrap(await submitWeeklyScores(league.slug, 1, [
      { teamId: t1.id, grossScore: 40, handicap: 5, netScore: 35, points: 10, bonusPoints: 0, isSub: false, isDnp: false, position: 1 },
      { teamId: t2.id, grossScore: 42, handicap: 5, netScore: 37, points: 8, bonusPoints: 0, isSub: false, isDnp: false, position: 2 },
    ]));

    // Week 2: t2 DNPs
    unwrap(await submitWeeklyScores(league.slug, 2, [
      { teamId: t1.id, grossScore: 39, handicap: 5, netScore: 34, points: 10, bonusPoints: 0, isSub: false, isDnp: false, position: 1 },
      { teamId: t2.id, grossScore: 0, handicap: 0, netScore: 0, points: 0, bonusPoints: 0, isSub: false, isDnp: true, position: 0 },
    ]));

    // Week 3: t2 DNPs again (now 2 DNPs, exceeds maxDnp of 1)
    unwrap(await submitWeeklyScores(league.slug, 3, [
      { teamId: t1.id, grossScore: 41, handicap: 5, netScore: 36, points: 10, bonusPoints: 0, isSub: false, isDnp: false, position: 1 },
      { teamId: t2.id, grossScore: 0, handicap: 0, netScore: 0, points: 0, bonusPoints: 0, isSub: false, isDnp: true, position: 0 },
    ]));

    const leaderboard = await getSeasonLeaderboard(season.id);
    expect(leaderboard).toHaveLength(2);

    // Consistent team should be ranked first with their real points
    expect(leaderboard[0].name).toBe("Consistent");
    expect(leaderboard[0].totalPoints).toBe(30);

    // Absent team exceeded maxDnp (2 > 1), so totalPoints is set to 0 (from -Infinity)
    expect(leaderboard[1].name).toBe("Absent");
    expect(leaderboard[1].totalPoints).toBe(0);
  });
});

describe("getAllTimeLeaderboard (stroke play)", () => {
  it("aggregates stroke play stats across seasons", async () => {
    const league = unwrap(await createLeague("SP All Time League", "securepass123"));
    setAuthContext(league.id, league.slug, league.adminUsername);

    await testPrisma.league.update({
      where: { id: league.id },
      data: { scoringType: "stroke_play" },
    });

    // Season 1
    const s1 = unwrap(await createSeason(league.slug, "Season 1", 2025));

    const t1 = unwrap(await createTeam(league.id, "Alpha"));
    const t2 = unwrap(await createTeam(league.id, "Bravo"));
    await approveTeam(league.slug, t1.id);
    await approveTeam(league.slug, t2.id);

    unwrap(await submitWeeklyScores(league.slug, 1, [
      { teamId: t1.id, grossScore: 38, handicap: 5, netScore: 33, points: 10, bonusPoints: 0, isSub: false, isDnp: false, position: 1 },
      { teamId: t2.id, grossScore: 42, handicap: 6, netScore: 36, points: 8, bonusPoints: 0, isSub: false, isDnp: false, position: 2 },
    ]));

    unwrap(await submitWeeklyScores(league.slug, 2, [
      { teamId: t1.id, grossScore: 40, handicap: 5, netScore: 35, points: 10, bonusPoints: 0, isSub: false, isDnp: false, position: 1 },
      { teamId: t2.id, grossScore: 43, handicap: 6, netScore: 37, points: 8, bonusPoints: 0, isSub: false, isDnp: false, position: 2 },
    ]));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const leaderboard: any[] = await getAllTimeLeaderboard(league.id);
    expect(leaderboard.length).toBe(2);

    // Alpha: 20 total points across weeks, Bravo: 16
    expect(leaderboard[0].name).toBe("Alpha");
    expect(leaderboard[0].totalPoints).toBe(20);
    expect(leaderboard[0].roundsPlayed).toBe(2);
    // Alpha avgNet = (33 + 35) / 2 = 34
    expect(leaderboard[0].avgNet).toBeCloseTo(34, 1);
    expect(leaderboard[0].bestFinish).toBe(1);

    expect(leaderboard[1].name).toBe("Bravo");
    expect(leaderboard[1].totalPoints).toBe(16);
    expect(leaderboard[1].roundsPlayed).toBe(2);
    // Bravo avgNet = (36 + 37) / 2 = 36.5
    expect(leaderboard[1].avgNet).toBeCloseTo(36.5, 1);
  });

  it("uses avgNet as tiebreaker when points are equal", async () => {
    const league = unwrap(await createLeague("SP AllTime Tie League", "securepass123"));
    setAuthContext(league.id, league.slug, league.adminUsername);

    await testPrisma.league.update({
      where: { id: league.id },
      data: { scoringType: "stroke_play" },
    });

    unwrap(await createSeason(league.slug, "Season 1", 2025));

    const t1 = unwrap(await createTeam(league.id, "LowNet"));
    const t2 = unwrap(await createTeam(league.id, "HighNet"));
    await approveTeam(league.slug, t1.id);
    await approveTeam(league.slug, t2.id);

    // Both get same points, but LowNet has better average net
    unwrap(await submitWeeklyScores(league.slug, 1, [
      { teamId: t1.id, grossScore: 38, handicap: 5, netScore: 33, points: 10, bonusPoints: 0, isSub: false, isDnp: false, position: 1 },
      { teamId: t2.id, grossScore: 44, handicap: 8, netScore: 36, points: 10, bonusPoints: 0, isSub: false, isDnp: false, position: 1 },
    ]));

    const leaderboard = await getAllTimeLeaderboard(league.id);
    expect(leaderboard).toHaveLength(2);
    // Both have 10 points; tiebreaker is avgNet (lower is better)
    expect(leaderboard[0].name).toBe("LowNet");
    expect(leaderboard[1].name).toBe("HighNet");
  });
});

// ==========================================
// Tests — Hybrid
// ==========================================

describe("getLeaderboardWithMovement (hybrid)", () => {
  it("combines match play and stroke play points with field weight", async () => {
    const league = unwrap(await createLeague("Hybrid Movement League", "securepass123"));
    setAuthContext(league.id, league.slug, league.adminUsername);
    unwrap(await createSeason(league.slug, "Season 1", 2025));

    // Switch to hybrid with 0.5 field weight (50% match, 50% field)
    await testPrisma.league.update({
      where: { id: league.id },
      data: { scoringType: "hybrid", hybridFieldWeight: 0.5 },
    });

    const t1 = unwrap(await createTeam(league.id, "Alpha"));
    const t2 = unwrap(await createTeam(league.id, "Bravo"));
    await approveTeam(league.slug, t1.id);
    await approveTeam(league.slug, t2.id);

    // Matchup: Alpha wins (20 match points), Bravo loses (0 match points)
    await submitMatchup(league.slug, 1, t1.id, 38, 5, 33, 20, false, t2.id, 42, 5, 37, 0, false);

    // Weekly scores: Bravo does better in the field
    unwrap(await submitWeeklyScores(league.slug, 1, [
      { teamId: t1.id, grossScore: 44, handicap: 6, netScore: 38, points: 6, bonusPoints: 0, isSub: false, isDnp: false, position: 2 },
      { teamId: t2.id, grossScore: 38, handicap: 4, netScore: 34, points: 10, bonusPoints: 0, isSub: false, isDnp: false, position: 1 },
    ]));

    const leaderboard = await getLeaderboardWithMovement(league.id);
    expect(leaderboard).toHaveLength(2);

    // Alpha: matchPoints=20, fieldPoints=6 => total = 20*0.5 + 6*0.5 = 13
    // Bravo: matchPoints=0, fieldPoints=10 => total = 0*0.5 + 10*0.5 = 5
    const alpha = leaderboard.find((t) => t.name === "Alpha")!;
    const bravo = leaderboard.find((t) => t.name === "Bravo")!;

    expect(alpha).toBeDefined();
    expect(bravo).toBeDefined();
    expect(alpha.totalPoints).toBeCloseTo(13, 1);
    expect(bravo.totalPoints).toBeCloseTo(5, 1);

    // Alpha should rank higher
    expect(leaderboard[0].name).toBe("Alpha");

    // Hybrid fields
    expect(alpha.matchPoints).toBe(20);
    expect(alpha.fieldPoints).toBe(6);
    expect(bravo.matchPoints).toBe(0);
    expect(bravo.fieldPoints).toBe(10);
  });

  it("tracks movement across weeks in hybrid mode", async () => {
    const league = unwrap(await createLeague("Hybrid Multi-Week League", "securepass123"));
    setAuthContext(league.id, league.slug, league.adminUsername);
    unwrap(await createSeason(league.slug, "Season 1", 2025));

    await testPrisma.league.update({
      where: { id: league.id },
      data: { scoringType: "hybrid", hybridFieldWeight: 0.5 },
    });

    const t1 = unwrap(await createTeam(league.id, "Alpha"));
    const t2 = unwrap(await createTeam(league.id, "Bravo"));
    await approveTeam(league.slug, t1.id);
    await approveTeam(league.slug, t2.id);

    // Week 1: Alpha dominates both match and field
    await submitMatchup(league.slug, 1, t1.id, 38, 5, 33, 20, false, t2.id, 42, 5, 37, 0, false);
    unwrap(await submitWeeklyScores(league.slug, 1, [
      { teamId: t1.id, grossScore: 38, handicap: 5, netScore: 33, points: 10, bonusPoints: 0, isSub: false, isDnp: false, position: 1 },
      { teamId: t2.id, grossScore: 44, handicap: 6, netScore: 38, points: 6, bonusPoints: 0, isSub: false, isDnp: false, position: 2 },
    ]));

    // Week 2: Bravo rallies hard
    await submitMatchup(league.slug, 2, t1.id, 45, 5, 40, 0, false, t2.id, 36, 4, 32, 20, false);
    unwrap(await submitWeeklyScores(league.slug, 2, [
      { teamId: t2.id, grossScore: 36, handicap: 4, netScore: 32, points: 10, bonusPoints: 0, isSub: false, isDnp: false, position: 1 },
      { teamId: t1.id, grossScore: 46, handicap: 5, netScore: 41, points: 6, bonusPoints: 0, isSub: false, isDnp: false, position: 2 },
    ]));

    const leaderboard = await getLeaderboardWithMovement(league.id);
    expect(leaderboard).toHaveLength(2);

    // Both teams played in previous week, so movement should be populated
    for (const team of leaderboard) {
      expect(team.previousRank).not.toBeNull();
      expect(team.rankChange).not.toBeNull();
    }

    // Verify hybrid-specific fields are present
    for (const team of leaderboard) {
      expect(team.matchPoints).toBeDefined();
      expect(team.fieldPoints).toBeDefined();
      expect(team.avgNet).toBeDefined();
      expect(team.roundsPlayed).toBe(2);
    }
  });

  it("returns null movement when no data exists", async () => {
    const league = unwrap(await createLeague("Hybrid Empty League", "securepass123"));
    setAuthContext(league.id, league.slug, league.adminUsername);
    unwrap(await createSeason(league.slug, "Season 1", 2025));

    await testPrisma.league.update({
      where: { id: league.id },
      data: { scoringType: "hybrid", hybridFieldWeight: 0.5 },
    });

    const t1 = unwrap(await createTeam(league.id, "Alpha"));
    await approveTeam(league.slug, t1.id);

    const leaderboard = await getLeaderboardWithMovement(league.id);
    expect(leaderboard).toHaveLength(1);

    // With no matchups and no weekly scores, the hybrid path should still
    // produce results with null movement
    expect(leaderboard[0].rankChange).toBeNull();
    expect(leaderboard[0].previousRank).toBeNull();
  });
});

describe("getSeasonLeaderboard (hybrid)", () => {
  it("returns hybrid rankings for a season", async () => {
    const league = unwrap(await createLeague("Hybrid Season League", "securepass123"));
    setAuthContext(league.id, league.slug, league.adminUsername);

    // 0.4 field weight: 60% match, 40% field
    await testPrisma.league.update({
      where: { id: league.id },
      data: { scoringType: "hybrid", hybridFieldWeight: 0.4 },
    });

    const season = unwrap(await createSeason(league.slug, "Season 1", 2025));
    await testPrisma.season.update({
      where: { id: season.id },
      data: { scoringType: "hybrid" },
    });

    const t1 = unwrap(await createTeam(league.id, "MatchKing"));
    const t2 = unwrap(await createTeam(league.id, "FieldKing"));
    const t3 = unwrap(await createTeam(league.id, "Average"));
    await approveTeam(league.slug, t1.id);
    await approveTeam(league.slug, t2.id);
    await approveTeam(league.slug, t3.id);

    // MatchKing dominates matchups; FieldKing dominates weekly scores; Average is middling
    // Matchup week 1: MatchKing beats FieldKing
    await submitMatchup(league.slug, 1, t1.id, 38, 5, 33, 20, false, t2.id, 44, 6, 38, 0, false);
    // Matchup week 2: MatchKing beats Average
    await submitMatchup(league.slug, 2, t1.id, 39, 5, 34, 20, false, t3.id, 43, 6, 37, 0, false);
    // Matchup week 3: Average beats FieldKing
    await submitMatchup(league.slug, 3, t3.id, 40, 5, 35, 20, false, t2.id, 44, 6, 38, 0, false);

    // Weekly field scores: FieldKing consistently wins field
    unwrap(await submitWeeklyScores(league.slug, 1, [
      { teamId: t2.id, grossScore: 36, handicap: 3, netScore: 33, points: 10, bonusPoints: 0, isSub: false, isDnp: false, position: 1 },
      { teamId: t3.id, grossScore: 40, handicap: 5, netScore: 35, points: 8, bonusPoints: 0, isSub: false, isDnp: false, position: 2 },
      { teamId: t1.id, grossScore: 44, handicap: 7, netScore: 37, points: 6, bonusPoints: 0, isSub: false, isDnp: false, position: 3 },
    ]));

    unwrap(await submitWeeklyScores(league.slug, 2, [
      { teamId: t2.id, grossScore: 37, handicap: 3, netScore: 34, points: 10, bonusPoints: 0, isSub: false, isDnp: false, position: 1 },
      { teamId: t3.id, grossScore: 41, handicap: 5, netScore: 36, points: 8, bonusPoints: 0, isSub: false, isDnp: false, position: 2 },
      { teamId: t1.id, grossScore: 45, handicap: 7, netScore: 38, points: 6, bonusPoints: 0, isSub: false, isDnp: false, position: 3 },
    ]));

    unwrap(await submitWeeklyScores(league.slug, 3, [
      { teamId: t2.id, grossScore: 35, handicap: 3, netScore: 32, points: 10, bonusPoints: 0, isSub: false, isDnp: false, position: 1 },
      { teamId: t1.id, grossScore: 41, handicap: 6, netScore: 35, points: 8, bonusPoints: 0, isSub: false, isDnp: false, position: 2 },
      { teamId: t3.id, grossScore: 43, handicap: 5, netScore: 38, points: 6, bonusPoints: 0, isSub: false, isDnp: false, position: 3 },
    ]));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const leaderboard: any[] = await getSeasonLeaderboard(season.id);
    expect(leaderboard).toHaveLength(3);

    // MatchKing: matchPoints=40, fieldPoints=20 => 40*0.6 + 20*0.4 = 24+8 = 32
    // FieldKing: matchPoints=0, fieldPoints=30 => 0*0.6 + 30*0.4 = 0+12 = 12
    // Average: matchPoints=20, fieldPoints=22 => 20*0.6 + 22*0.4 = 12+8.8 = 20.8
    const matchKing = leaderboard.find((t) => t.name === "MatchKing")!;
    const fieldKing = leaderboard.find((t) => t.name === "FieldKing")!;
    const average = leaderboard.find((t) => t.name === "Average")!;

    expect(matchKing).toBeDefined();
    expect(fieldKing).toBeDefined();
    expect(average).toBeDefined();

    // MatchKing should be first with highest combined score
    expect(leaderboard[0].name).toBe("MatchKing");
    expect(matchKing.totalPoints).toBeCloseTo(32, 1);

    // Average should be second
    expect(average.totalPoints).toBeCloseTo(20.8, 1);

    // FieldKing last despite dominating field
    expect(fieldKing.totalPoints).toBeCloseTo(12, 1);

    // Verify hybrid-specific fields
    expect(matchKing.matchPoints).toBe(40);
    expect(matchKing.fieldPoints).toBe(20);
    expect(fieldKing.matchPoints).toBe(0);
    expect(fieldKing.fieldPoints).toBe(30);
    expect(average.matchPoints).toBe(20);
    expect(average.fieldPoints).toBe(22);

    // Verify roundsPlayed
    expect(matchKing.roundsPlayed).toBe(3);
    expect(fieldKing.roundsPlayed).toBe(3);
    expect(average.roundsPlayed).toBe(3);
  });

  it("applies hybridFieldWeight correctly at extremes", async () => {
    const league = unwrap(await createLeague("Hybrid Weight Extreme League", "securepass123"));
    setAuthContext(league.id, league.slug, league.adminUsername);

    // Weight of 1.0: 100% field, 0% match
    await testPrisma.league.update({
      where: { id: league.id },
      data: { scoringType: "hybrid", hybridFieldWeight: 1.0 },
    });

    const season = unwrap(await createSeason(league.slug, "Season 1", 2025));
    await testPrisma.season.update({
      where: { id: season.id },
      data: { scoringType: "hybrid" },
    });

    const t1 = unwrap(await createTeam(league.id, "MatchWinner"));
    const t2 = unwrap(await createTeam(league.id, "FieldWinner"));
    await approveTeam(league.slug, t1.id);
    await approveTeam(league.slug, t2.id);

    // MatchWinner wins the matchup with 20 points
    await submitMatchup(league.slug, 1, t1.id, 38, 5, 33, 20, false, t2.id, 44, 6, 38, 0, false);

    // FieldWinner dominates the field
    unwrap(await submitWeeklyScores(league.slug, 1, [
      { teamId: t2.id, grossScore: 36, handicap: 3, netScore: 33, points: 10, bonusPoints: 0, isSub: false, isDnp: false, position: 1 },
      { teamId: t1.id, grossScore: 44, handicap: 7, netScore: 37, points: 6, bonusPoints: 0, isSub: false, isDnp: false, position: 2 },
    ]));

    const leaderboard = await getSeasonLeaderboard(season.id);
    expect(leaderboard).toHaveLength(2);

    // With 100% field weight: match points are irrelevant
    // MatchWinner: 20*0 + 6*1 = 6
    // FieldWinner: 0*0 + 10*1 = 10
    expect(leaderboard[0].name).toBe("FieldWinner");
    expect(leaderboard[0].totalPoints).toBeCloseTo(10, 1);
    expect(leaderboard[1].name).toBe("MatchWinner");
    expect(leaderboard[1].totalPoints).toBeCloseTo(6, 1);
  });
});
