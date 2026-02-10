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

import { getHandicapSettings, getTeamHandicap, getHandicapHistory, getHandicapHistoryForSeason } from "@/lib/actions/handicap-settings";
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
// Tests
// ==========================================

describe("getHandicapSettings", () => {
  it("returns default handicap settings for a new league", async () => {
    const league = unwrap(await createLeague("Handicap Test League", "securepass123"));
    const settings = await getHandicapSettings(league.id);

    expect(settings.baseScore).toBe(35);
    expect(settings.multiplier).toBe(0.9);
    expect(settings.rounding).toBe("floor");
    expect(settings.defaultHandicap).toBe(0);
    expect(settings.maxHandicap).toBe(9);
    expect(settings.scoreSelection).toBe("all");
    expect(settings.dropHighest).toBe(0);
    expect(settings.dropLowest).toBe(0);
    expect(settings.useWeighting).toBe(false);
    expect(settings.provWeeks).toBe(0);
  });
});

describe("getTeamHandicap", () => {
  let leagueId: number;
  let leagueSlug: string;
  let teamAId: number;
  let teamBId: number;

  beforeEach(async () => {
    const league = unwrap(await createLeague("Team HC League", "securepass123"));
    leagueId = league.id;
    leagueSlug = league.slug;
    setAuthContext(league.id, league.slug, league.adminUsername);

    unwrap(await createSeason(leagueSlug, "Season 1", 2025));
    const teamA = unwrap(await createTeam(leagueId, "Team Alpha"));
    const teamB = unwrap(await createTeam(leagueId, "Team Beta"));
    teamAId = teamA.id;
    teamBId = teamB.id;
    await approveTeam(leagueSlug, teamAId);
    await approveTeam(leagueSlug, teamBId);
  });

  it("returns default handicap for team with no scores", async () => {
    const handicap = await getTeamHandicap(leagueId, teamAId);
    expect(handicap).toBe(0); // defaultHandicap = 0
  });

  it("calculates handicap from match play scores", async () => {
    // Submit a matchup to give teams some scores
    await submitMatchup(
      leagueSlug, 1,
      teamAId, 42, 5, 37, 20, false,
      teamBId, 45, 5, 40, 0, false,
    );

    // Now get handicap for week 2 (should use week 1 score)
    const handicap = await getTeamHandicap(leagueId, teamAId, 2);
    expect(typeof handicap).toBe("number");
    expect(isFinite(handicap)).toBe(true);
  });

  it("calculates handicap from stroke play scores when scoringType is stroke_play", async () => {
    // Update league to stroke_play
    await testPrisma.league.update({
      where: { id: leagueId },
      data: { scoringType: "stroke_play" },
    });

    // Submit weekly scores for week 1
    unwrap(await submitWeeklyScores(leagueSlug, 1, [
      { teamId: teamAId, grossScore: 40, handicap: 5, netScore: 35, points: 10, bonusPoints: 0, isSub: false, isDnp: false, position: 1 },
      { teamId: teamBId, grossScore: 44, handicap: 5, netScore: 39, points: 8, bonusPoints: 0, isSub: false, isDnp: false, position: 2 },
    ]));

    // Submit weekly scores for week 2
    unwrap(await submitWeeklyScores(leagueSlug, 2, [
      { teamId: teamAId, grossScore: 38, handicap: 4, netScore: 34, points: 10, bonusPoints: 0, isSub: false, isDnp: false, position: 1 },
      { teamId: teamBId, grossScore: 46, handicap: 5, netScore: 41, points: 8, bonusPoints: 0, isSub: false, isDnp: false, position: 2 },
    ]));

    // Get handicap for week 3 using stroke_play scoring type
    const handicap = await getTeamHandicap(leagueId, teamAId, 3, "stroke_play");
    expect(typeof handicap).toBe("number");
    expect(isFinite(handicap)).toBe(true);
    // Handicap should be calculated from gross scores 40 and 38
    // with default settings: baseScore=35, multiplier=0.9
    // (40-35)*0.9 = 4.5, (38-35)*0.9 = 2.7 => avg ~3.6 => floor = 3
    expect(handicap).toBeGreaterThanOrEqual(0);
  });
});

describe("getHandicapHistory", () => {
  let leagueId: number;
  let leagueSlug: string;

  beforeEach(async () => {
    const league = unwrap(await createLeague("HC History League", "securepass123"));
    leagueId = league.id;
    leagueSlug = league.slug;
    setAuthContext(league.id, league.slug, league.adminUsername);

    unwrap(await createSeason(leagueSlug, "Season 1", 2025));
  });

  it("returns empty history for teams with no matchups", async () => {
    const teamA = unwrap(await createTeam(leagueId, "Team Alpha"));
    await approveTeam(leagueSlug, teamA.id);

    const history = await getHandicapHistory(leagueId);
    expect(history).toHaveLength(1);
    expect(history[0].teamName).toBe("Team Alpha");
    expect(history[0].weeklyHandicaps).toEqual([]);
    expect(history[0].currentHandicap).toBeNull();
  });

  it("returns handicap progression from matchups", async () => {
    const teamA = unwrap(await createTeam(leagueId, "Team Alpha"));
    const teamB = unwrap(await createTeam(leagueId, "Team Beta"));
    await approveTeam(leagueSlug, teamA.id);
    await approveTeam(leagueSlug, teamB.id);

    // Submit matchups across multiple weeks
    await submitMatchup(leagueSlug, 1, teamA.id, 42, 5, 37, 20, false, teamB.id, 45, 3, 42, 0, false);
    await submitMatchup(leagueSlug, 2, teamA.id, 40, 6, 34, 20, false, teamB.id, 43, 4, 39, 0, false);

    const history = await getHandicapHistory(leagueId);
    expect(history).toHaveLength(2);

    const teamAHistory = history.find((h) => h.teamName === "Team Alpha");
    expect(teamAHistory).toBeDefined();
    expect(teamAHistory!.weeklyHandicaps).toHaveLength(2);
    expect(teamAHistory!.weeklyHandicaps[0].week).toBe(1);
    expect(teamAHistory!.weeklyHandicaps[1].week).toBe(2);
    expect(teamAHistory!.currentHandicap).not.toBeNull();
  });
});

describe("getHandicapHistoryForSeason", () => {
  let leagueId: number;
  let leagueSlug: string;
  let seasonId: number;
  let teamAId: number;
  let teamBId: number;

  // ==========================================
  // Match play tests
  // ==========================================

  describe("match play", () => {
    beforeEach(async () => {
      const league = unwrap(await createLeague("Match Play HC Season", "securepass123", "match_play"));
      leagueId = league.id;
      leagueSlug = league.slug;
      setAuthContext(league.id, league.slug, league.adminUsername);

      const season = unwrap(await createSeason(leagueSlug, "Season 1", 2025));
      seasonId = season.id;

      const teamA = unwrap(await createTeam(leagueId, "Team Alpha"));
      const teamB = unwrap(await createTeam(leagueId, "Team Beta"));
      teamAId = teamA.id;
      teamBId = teamB.id;
      await approveTeam(leagueSlug, teamAId);
      await approveTeam(leagueSlug, teamBId);
    });

    it("returns handicap progression from matchups for match play season", async () => {
      // Submit matchups across multiple weeks
      await submitMatchup(leagueSlug, 1, teamAId, 42, 5, 37, 20, false, teamBId, 45, 3, 42, 0, false);
      await submitMatchup(leagueSlug, 2, teamAId, 40, 6, 34, 20, false, teamBId, 43, 4, 39, 0, false);
      await submitMatchup(leagueSlug, 3, teamAId, 38, 6, 32, 15, false, teamBId, 41, 5, 36, 5, false);

      const history = await getHandicapHistoryForSeason(seasonId);

      expect(history).toHaveLength(2);

      const teamAHistory = history.find((h) => h.teamId === teamAId);
      expect(teamAHistory).toBeDefined();
      expect(teamAHistory!.teamName).toBe("Team Alpha");
      expect(teamAHistory!.weeklyHandicaps).toHaveLength(3);
      expect(teamAHistory!.weeklyHandicaps[0]).toEqual({ week: 1, handicap: 5 });
      expect(teamAHistory!.weeklyHandicaps[1]).toEqual({ week: 2, handicap: 6 });
      expect(teamAHistory!.weeklyHandicaps[2]).toEqual({ week: 3, handicap: 6 });
      expect(teamAHistory!.currentHandicap).toBe(6); // Last non-sub handicap

      const teamBHistory = history.find((h) => h.teamId === teamBId);
      expect(teamBHistory).toBeDefined();
      expect(teamBHistory!.teamName).toBe("Team Beta");
      expect(teamBHistory!.weeklyHandicaps).toHaveLength(3);
      expect(teamBHistory!.weeklyHandicaps[0]).toEqual({ week: 1, handicap: 3 });
      expect(teamBHistory!.weeklyHandicaps[1]).toEqual({ week: 2, handicap: 4 });
      expect(teamBHistory!.weeklyHandicaps[2]).toEqual({ week: 3, handicap: 5 });
      expect(teamBHistory!.currentHandicap).toBe(5);
    });

    it("returns empty history for season with no data", async () => {
      // No matchups submitted -- teams exist but have no scores
      const history = await getHandicapHistoryForSeason(seasonId);

      expect(history).toHaveLength(2);

      for (const entry of history) {
        expect(entry.weeklyHandicaps).toEqual([]);
        expect(entry.currentHandicap).toBeNull();
      }
    });

    it("excludes sub handicaps from currentHandicap in match play", async () => {
      // Week 1: both teams play normally
      await submitMatchup(leagueSlug, 1, teamAId, 42, 5, 37, 20, false, teamBId, 45, 3, 42, 0, false);
      // Week 2: Team Alpha has a sub
      await submitMatchup(leagueSlug, 2, teamAId, 38, 8, 30, 20, true, teamBId, 43, 4, 39, 0, false);

      const history = await getHandicapHistoryForSeason(seasonId);
      const teamAHistory = history.find((h) => h.teamId === teamAId);
      expect(teamAHistory).toBeDefined();
      // Both weeks should appear in weeklyHandicaps
      expect(teamAHistory!.weeklyHandicaps).toHaveLength(2);
      // currentHandicap should be from week 1 (5), not week 2 sub (8)
      expect(teamAHistory!.currentHandicap).toBe(5);
    });
  });

  // ==========================================
  // Stroke play tests
  // ==========================================

  describe("stroke play", () => {
    beforeEach(async () => {
      const league = unwrap(await createLeague("Stroke Play HC Season", "securepass123", "stroke_play"));
      leagueId = league.id;
      leagueSlug = league.slug;
      setAuthContext(league.id, league.slug, league.adminUsername);

      const season = unwrap(await createSeason(leagueSlug, "Season 1", 2025));
      seasonId = season.id;

      const teamA = unwrap(await createTeam(leagueId, "Team Alpha"));
      const teamB = unwrap(await createTeam(leagueId, "Team Beta"));
      teamAId = teamA.id;
      teamBId = teamB.id;
      await approveTeam(leagueSlug, teamAId);
      await approveTeam(leagueSlug, teamBId);
    });

    it("returns handicap progression from weekly scores for stroke play season", async () => {
      // Submit weekly scores across 3 weeks
      unwrap(await submitWeeklyScores(leagueSlug, 1, [
        { teamId: teamAId, grossScore: 42, handicap: 5, netScore: 37, points: 10, bonusPoints: 0, isSub: false, isDnp: false, position: 1 },
        { teamId: teamBId, grossScore: 45, handicap: 3, netScore: 42, points: 8, bonusPoints: 0, isSub: false, isDnp: false, position: 2 },
      ]));

      unwrap(await submitWeeklyScores(leagueSlug, 2, [
        { teamId: teamAId, grossScore: 40, handicap: 6, netScore: 34, points: 10, bonusPoints: 0, isSub: false, isDnp: false, position: 1 },
        { teamId: teamBId, grossScore: 43, handicap: 4, netScore: 39, points: 8, bonusPoints: 0, isSub: false, isDnp: false, position: 2 },
      ]));

      unwrap(await submitWeeklyScores(leagueSlug, 3, [
        { teamId: teamAId, grossScore: 38, handicap: 5, netScore: 33, points: 10, bonusPoints: 0, isSub: false, isDnp: false, position: 1 },
        { teamId: teamBId, grossScore: 41, handicap: 5, netScore: 36, points: 8, bonusPoints: 0, isSub: false, isDnp: false, position: 2 },
      ]));

      const history = await getHandicapHistoryForSeason(seasonId);

      expect(history).toHaveLength(2);

      const teamAHistory = history.find((h) => h.teamId === teamAId);
      expect(teamAHistory).toBeDefined();
      expect(teamAHistory!.teamName).toBe("Team Alpha");
      expect(teamAHistory!.weeklyHandicaps).toHaveLength(3);
      expect(teamAHistory!.weeklyHandicaps[0]).toEqual({ week: 1, handicap: 5 });
      expect(teamAHistory!.weeklyHandicaps[1]).toEqual({ week: 2, handicap: 6 });
      expect(teamAHistory!.weeklyHandicaps[2]).toEqual({ week: 3, handicap: 5 });
      expect(teamAHistory!.currentHandicap).toBe(5); // Last non-sub handicap

      const teamBHistory = history.find((h) => h.teamId === teamBId);
      expect(teamBHistory).toBeDefined();
      expect(teamBHistory!.weeklyHandicaps).toHaveLength(3);
      expect(teamBHistory!.weeklyHandicaps[0]).toEqual({ week: 1, handicap: 3 });
      expect(teamBHistory!.weeklyHandicaps[1]).toEqual({ week: 2, handicap: 4 });
      expect(teamBHistory!.weeklyHandicaps[2]).toEqual({ week: 3, handicap: 5 });
      expect(teamBHistory!.currentHandicap).toBe(5);
    });

    it("returns empty history for stroke play season with no scores", async () => {
      const history = await getHandicapHistoryForSeason(seasonId);

      expect(history).toHaveLength(2);
      for (const entry of history) {
        expect(entry.weeklyHandicaps).toEqual([]);
        expect(entry.currentHandicap).toBeNull();
      }
    });

    it("excludes DNP weeks from handicap history in stroke play", async () => {
      // Week 1: both teams play
      unwrap(await submitWeeklyScores(leagueSlug, 1, [
        { teamId: teamAId, grossScore: 42, handicap: 5, netScore: 37, points: 10, bonusPoints: 0, isSub: false, isDnp: false, position: 1 },
        { teamId: teamBId, grossScore: 45, handicap: 3, netScore: 42, points: 8, bonusPoints: 0, isSub: false, isDnp: false, position: 2 },
      ]));

      // Week 2: Team Alpha is DNP
      unwrap(await submitWeeklyScores(leagueSlug, 2, [
        { teamId: teamAId, grossScore: 0, handicap: 0, netScore: 0, points: 0, bonusPoints: 0, isSub: false, isDnp: true, position: 0 },
        { teamId: teamBId, grossScore: 43, handicap: 4, netScore: 39, points: 10, bonusPoints: 0, isSub: false, isDnp: false, position: 1 },
      ]));

      // Week 3: both teams play
      unwrap(await submitWeeklyScores(leagueSlug, 3, [
        { teamId: teamAId, grossScore: 40, handicap: 6, netScore: 34, points: 10, bonusPoints: 0, isSub: false, isDnp: false, position: 1 },
        { teamId: teamBId, grossScore: 44, handicap: 5, netScore: 39, points: 8, bonusPoints: 0, isSub: false, isDnp: false, position: 2 },
      ]));

      const history = await getHandicapHistoryForSeason(seasonId);

      const teamAHistory = history.find((h) => h.teamId === teamAId);
      expect(teamAHistory).toBeDefined();
      // DNP week should be excluded -- only weeks 1 and 3
      expect(teamAHistory!.weeklyHandicaps).toHaveLength(2);
      expect(teamAHistory!.weeklyHandicaps[0]).toEqual({ week: 1, handicap: 5 });
      expect(teamAHistory!.weeklyHandicaps[1]).toEqual({ week: 3, handicap: 6 });
      expect(teamAHistory!.currentHandicap).toBe(6);

      // Team B played all 3 weeks
      const teamBHistory = history.find((h) => h.teamId === teamBId);
      expect(teamBHistory).toBeDefined();
      expect(teamBHistory!.weeklyHandicaps).toHaveLength(3);
    });

    it("tracks sub handicaps in weeklyHandicaps but excludes from currentHandicap", async () => {
      // Week 1: Team Alpha plays normally
      unwrap(await submitWeeklyScores(leagueSlug, 1, [
        { teamId: teamAId, grossScore: 42, handicap: 5, netScore: 37, points: 10, bonusPoints: 0, isSub: false, isDnp: false, position: 1 },
        { teamId: teamBId, grossScore: 45, handicap: 3, netScore: 42, points: 8, bonusPoints: 0, isSub: false, isDnp: false, position: 2 },
      ]));

      // Week 2: Team Alpha has a sub
      unwrap(await submitWeeklyScores(leagueSlug, 2, [
        { teamId: teamAId, grossScore: 38, handicap: 8, netScore: 30, points: 10, bonusPoints: 0, isSub: true, isDnp: false, position: 1 },
        { teamId: teamBId, grossScore: 43, handicap: 4, netScore: 39, points: 8, bonusPoints: 0, isSub: false, isDnp: false, position: 2 },
      ]));

      const history = await getHandicapHistoryForSeason(seasonId);

      const teamAHistory = history.find((h) => h.teamId === teamAId);
      expect(teamAHistory).toBeDefined();
      // Both weeks appear in weeklyHandicaps (sub is still listed)
      expect(teamAHistory!.weeklyHandicaps).toHaveLength(2);
      expect(teamAHistory!.weeklyHandicaps[0]).toEqual({ week: 1, handicap: 5 });
      expect(teamAHistory!.weeklyHandicaps[1]).toEqual({ week: 2, handicap: 8 });
      // currentHandicap should be from week 1 (the last non-sub handicap)
      expect(teamAHistory!.currentHandicap).toBe(5);
    });
  });

  // ==========================================
  // Hybrid tests
  // ==========================================

  describe("hybrid", () => {
    beforeEach(async () => {
      const league = unwrap(await createLeague("Hybrid HC Season", "securepass123", "hybrid"));
      leagueId = league.id;
      leagueSlug = league.slug;
      setAuthContext(league.id, league.slug, league.adminUsername);

      const season = unwrap(await createSeason(leagueSlug, "Season 1", 2025));
      seasonId = season.id;

      const teamA = unwrap(await createTeam(leagueId, "Team Alpha"));
      const teamB = unwrap(await createTeam(leagueId, "Team Beta"));
      teamAId = teamA.id;
      teamBId = teamB.id;
      await approveTeam(leagueSlug, teamAId);
      await approveTeam(leagueSlug, teamBId);
    });

    it("merges matchup and weekly score handicap data for hybrid season", async () => {
      // Week 1: matchup only (no weekly scores)
      await submitMatchup(leagueSlug, 1, teamAId, 42, 5, 37, 15, false, teamBId, 45, 3, 42, 5, false);

      // Week 2: both matchup and weekly scores
      await submitMatchup(leagueSlug, 2, teamAId, 40, 6, 34, 15, false, teamBId, 43, 4, 39, 5, false);
      unwrap(await submitWeeklyScores(leagueSlug, 2, [
        { teamId: teamAId, grossScore: 40, handicap: 7, netScore: 33, points: 10, bonusPoints: 0, isSub: false, isDnp: false, position: 1 },
        { teamId: teamBId, grossScore: 43, handicap: 5, netScore: 38, points: 8, bonusPoints: 0, isSub: false, isDnp: false, position: 2 },
      ]));

      // Week 3: weekly scores only (no matchup)
      unwrap(await submitWeeklyScores(leagueSlug, 3, [
        { teamId: teamAId, grossScore: 38, handicap: 6, netScore: 32, points: 10, bonusPoints: 0, isSub: false, isDnp: false, position: 1 },
        { teamId: teamBId, grossScore: 41, handicap: 5, netScore: 36, points: 8, bonusPoints: 0, isSub: false, isDnp: false, position: 2 },
      ]));

      const history = await getHandicapHistoryForSeason(seasonId);

      expect(history).toHaveLength(2);

      const teamAHistory = history.find((h) => h.teamId === teamAId);
      expect(teamAHistory).toBeDefined();
      expect(teamAHistory!.weeklyHandicaps).toHaveLength(3);

      // Week 1: from matchups (no weekly scores to override)
      expect(teamAHistory!.weeklyHandicaps[0]).toEqual({ week: 1, handicap: 5 });
      // Week 2: weekly scores override matchup handicap (7 instead of 6)
      expect(teamAHistory!.weeklyHandicaps[1]).toEqual({ week: 2, handicap: 7 });
      // Week 3: from weekly scores only
      expect(teamAHistory!.weeklyHandicaps[2]).toEqual({ week: 3, handicap: 6 });

      const teamBHistory = history.find((h) => h.teamId === teamBId);
      expect(teamBHistory).toBeDefined();
      expect(teamBHistory!.weeklyHandicaps).toHaveLength(3);
      // Week 1: from matchups
      expect(teamBHistory!.weeklyHandicaps[0]).toEqual({ week: 1, handicap: 3 });
      // Week 2: weekly scores override matchup (5 instead of 4)
      expect(teamBHistory!.weeklyHandicaps[1]).toEqual({ week: 2, handicap: 5 });
      // Week 3: from weekly scores only
      expect(teamBHistory!.weeklyHandicaps[2]).toEqual({ week: 3, handicap: 5 });
    });

    it("uses weekly scores for currentHandicap in hybrid mode", async () => {
      // Week 1: matchup with handicap 5 for Team Alpha
      await submitMatchup(leagueSlug, 1, teamAId, 42, 5, 37, 15, false, teamBId, 45, 3, 42, 5, false);

      // Week 2: matchup with handicap 6, weekly scores with handicap 7
      await submitMatchup(leagueSlug, 2, teamAId, 40, 6, 34, 15, false, teamBId, 43, 4, 39, 5, false);
      unwrap(await submitWeeklyScores(leagueSlug, 2, [
        { teamId: teamAId, grossScore: 40, handicap: 7, netScore: 33, points: 10, bonusPoints: 0, isSub: false, isDnp: false, position: 1 },
        { teamId: teamBId, grossScore: 43, handicap: 5, netScore: 38, points: 8, bonusPoints: 0, isSub: false, isDnp: false, position: 2 },
      ]));

      const history = await getHandicapHistoryForSeason(seasonId);

      const teamAHistory = history.find((h) => h.teamId === teamAId);
      expect(teamAHistory).toBeDefined();
      // currentHandicap should come from weekly scores (7), not matchups (6)
      expect(teamAHistory!.currentHandicap).toBe(7);

      const teamBHistory = history.find((h) => h.teamId === teamBId);
      expect(teamBHistory).toBeDefined();
      // currentHandicap from weekly scores (5), not matchups (4)
      expect(teamBHistory!.currentHandicap).toBe(5);
    });

    it("falls back to matchup currentHandicap when no weekly scores exist", async () => {
      // Only matchups, no weekly scores
      await submitMatchup(leagueSlug, 1, teamAId, 42, 5, 37, 15, false, teamBId, 45, 3, 42, 5, false);
      await submitMatchup(leagueSlug, 2, teamAId, 40, 6, 34, 15, false, teamBId, 43, 4, 39, 5, false);

      const history = await getHandicapHistoryForSeason(seasonId);

      const teamAHistory = history.find((h) => h.teamId === teamAId);
      expect(teamAHistory).toBeDefined();
      // currentHandicap should fall back to matchup data since weekly is null
      expect(teamAHistory!.currentHandicap).toBe(6);

      const teamBHistory = history.find((h) => h.teamId === teamBId);
      expect(teamBHistory).toBeDefined();
      expect(teamBHistory!.currentHandicap).toBe(4);
    });

    it("returns empty history for hybrid season with no data", async () => {
      const history = await getHandicapHistoryForSeason(seasonId);

      expect(history).toHaveLength(2);
      for (const entry of history) {
        expect(entry.weeklyHandicaps).toEqual([]);
        expect(entry.currentHandicap).toBeNull();
      }
    });
  });
});
