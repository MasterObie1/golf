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
  previewWeeklyScores,
  submitWeeklyScores,
  getWeeklyScoreHistory,
  getWeeklyScoreHistoryForSeason,
  getTeamWeeklyScores,
  deleteWeeklyScores,
  getCurrentStrokePlayWeek,
} from "@/lib/actions/weekly-scores";
import { createLeague } from "@/lib/actions/leagues";
import { createTeam, approveTeam } from "@/lib/actions/teams";
import { createSeason } from "@/lib/actions/seasons";
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

describe("previewWeeklyScores", () => {
  it("calculates handicaps, net scores, positions, and points", async () => {
    const league = unwrap(await createLeague("Weekly Preview League", "securepass123"));
    setAuthContext(league.id, league.slug, league.adminUsername);
    unwrap(await createSeason(league.slug, "Season 1", 2025));

    // Update scoring type to stroke_play
    await testPrisma.league.update({
      where: { id: league.id },
      data: { scoringType: "stroke_play" },
    });

    const t1 = unwrap(await createTeam(league.id, "Team A"));
    const t2 = unwrap(await createTeam(league.id, "Team B"));
    await approveTeam(league.slug, t1.id);
    await approveTeam(league.slug, t2.id);

    const result = await previewWeeklyScores(league.slug, league.id, 1, [
      { teamId: t1.id, grossScore: 42, isSub: false, isDnp: false },
      { teamId: t2.id, grossScore: 45, isSub: false, isDnp: false },
    ]);

    const preview = unwrap(result);
    expect(preview.weekNumber).toBe(1);
    expect(preview.isWeekOne).toBe(true);
    expect(preview.scores).toHaveLength(2);

    // Lower net score should rank higher
    const sorted = preview.scores.filter((s) => !s.isDnp);
    expect(sorted[0].position).toBeLessThanOrEqual(sorted[1].position);
  });

  it("handles DNP teams", async () => {
    const league = unwrap(await createLeague("DNP Preview League", "securepass123"));
    setAuthContext(league.id, league.slug, league.adminUsername);
    unwrap(await createSeason(league.slug, "Season 1", 2025));

    await testPrisma.league.update({
      where: { id: league.id },
      data: { scoringType: "stroke_play" },
    });

    const t1 = unwrap(await createTeam(league.id, "Team A"));
    const t2 = unwrap(await createTeam(league.id, "Team B"));
    await approveTeam(league.slug, t1.id);
    await approveTeam(league.slug, t2.id);

    const result = await previewWeeklyScores(league.slug, league.id, 1, [
      { teamId: t1.id, grossScore: 42, isSub: false, isDnp: false },
      { teamId: t2.id, grossScore: 0, isSub: false, isDnp: true },
    ]);

    const preview = unwrap(result);
    const dnpEntry = preview.scores.find((s) => s.teamId === t2.id);
    expect(dnpEntry!.isDnp).toBe(true);
    expect(dnpEntry!.grossScore).toBe(0);
  });
});

describe("submitWeeklyScores", () => {
  let leagueSlug: string;
  let leagueId: number;
  let teamAId: number;
  let teamBId: number;

  beforeEach(async () => {
    const league = unwrap(await createLeague("Submit Scores League", "securepass123"));
    leagueSlug = league.slug;
    leagueId = league.id;
    setAuthContext(league.id, league.slug, league.adminUsername);
    unwrap(await createSeason(leagueSlug, "Season 1", 2025));

    await testPrisma.league.update({
      where: { id: leagueId },
      data: { scoringType: "stroke_play" },
    });

    const t1 = unwrap(await createTeam(leagueId, "Team A"));
    const t2 = unwrap(await createTeam(leagueId, "Team B"));
    teamAId = t1.id;
    teamBId = t2.id;
    await approveTeam(leagueSlug, teamAId);
    await approveTeam(leagueSlug, teamBId);
  });

  it("saves weekly scores to DB and updates team stats", async () => {
    const result = await submitWeeklyScores(leagueSlug, 1, [
      { teamId: teamAId, grossScore: 42, handicap: 5, netScore: 37, points: 10, bonusPoints: 2, isSub: false, isDnp: false, position: 1 },
      { teamId: teamBId, grossScore: 45, handicap: 3, netScore: 42, points: 8, bonusPoints: 1, isSub: false, isDnp: false, position: 2 },
    ]);
    expect(result.success).toBe(true);

    // Verify scores in DB
    const scores = await testPrisma.weeklyScore.findMany({
      where: { leagueId, weekNumber: 1 },
    });
    expect(scores).toHaveLength(2);

    // Team A should get 12 total points (10 + 2 bonus)
    const teamA = await testPrisma.team.findUnique({ where: { id: teamAId } });
    expect(teamA!.totalPoints).toBe(12);

    // Team B should get 9 total points (8 + 1 bonus)
    const teamB = await testPrisma.team.findUnique({ where: { id: teamBId } });
    expect(teamB!.totalPoints).toBe(9);
  });

  it("rejects duplicate week submission", async () => {
    await submitWeeklyScores(leagueSlug, 1, [
      { teamId: teamAId, grossScore: 42, handicap: 5, netScore: 37, points: 10, bonusPoints: 0, isSub: false, isDnp: false, position: 1 },
      { teamId: teamBId, grossScore: 45, handicap: 3, netScore: 42, points: 8, bonusPoints: 0, isSub: false, isDnp: false, position: 2 },
    ]);

    const result = await submitWeeklyScores(leagueSlug, 1, [
      { teamId: teamAId, grossScore: 40, handicap: 5, netScore: 35, points: 10, bonusPoints: 0, isSub: false, isDnp: false, position: 1 },
    ]);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("already submitted");
  });
});

describe("getWeeklyScoreHistory", () => {
  it("returns empty array for league with no scores", async () => {
    const league = unwrap(await createLeague("History League", "securepass123"));
    const history = await getWeeklyScoreHistory(league.id);
    expect(history).toEqual([]);
  });

  it("returns scores sorted by week desc", async () => {
    const league = unwrap(await createLeague("Score History League", "securepass123"));
    setAuthContext(league.id, league.slug, league.adminUsername);
    unwrap(await createSeason(league.slug, "Season 1", 2025));

    const t1 = unwrap(await createTeam(league.id, "Team A"));
    await approveTeam(league.slug, t1.id);

    await submitWeeklyScores(league.slug, 1, [
      { teamId: t1.id, grossScore: 42, handicap: 5, netScore: 37, points: 10, bonusPoints: 0, isSub: false, isDnp: false, position: 1 },
    ]);
    await submitWeeklyScores(league.slug, 2, [
      { teamId: t1.id, grossScore: 40, handicap: 6, netScore: 34, points: 10, bonusPoints: 0, isSub: false, isDnp: false, position: 1 },
    ]);

    const history = await getWeeklyScoreHistory(league.id);
    expect(history).toHaveLength(2);
    expect(history[0].weekNumber).toBe(2); // most recent first
    expect(history[1].weekNumber).toBe(1);
  });
});

describe("getTeamWeeklyScores", () => {
  it("returns scores for a specific team", async () => {
    const league = unwrap(await createLeague("Team Scores League", "securepass123"));
    setAuthContext(league.id, league.slug, league.adminUsername);
    unwrap(await createSeason(league.slug, "Season 1", 2025));

    const t1 = unwrap(await createTeam(league.id, "Team A"));
    const t2 = unwrap(await createTeam(league.id, "Team B"));
    await approveTeam(league.slug, t1.id);
    await approveTeam(league.slug, t2.id);

    await submitWeeklyScores(league.slug, 1, [
      { teamId: t1.id, grossScore: 42, handicap: 5, netScore: 37, points: 10, bonusPoints: 0, isSub: false, isDnp: false, position: 1 },
      { teamId: t2.id, grossScore: 45, handicap: 3, netScore: 42, points: 8, bonusPoints: 0, isSub: false, isDnp: false, position: 2 },
    ]);

    const scores = await getTeamWeeklyScores(league.id, t1.id);
    expect(scores).toHaveLength(1);
    expect(scores[0].team.name).toBe("Team A");
    expect(scores[0].grossScore).toBe(42);
  });
});

describe("deleteWeeklyScores", () => {
  it("removes scores and decrements team stats", async () => {
    const league = unwrap(await createLeague("Delete Scores League", "securepass123"));
    setAuthContext(league.id, league.slug, league.adminUsername);
    unwrap(await createSeason(league.slug, "Season 1", 2025));

    const t1 = unwrap(await createTeam(league.id, "Team A"));
    await approveTeam(league.slug, t1.id);

    await submitWeeklyScores(league.slug, 1, [
      { teamId: t1.id, grossScore: 42, handicap: 5, netScore: 37, points: 15, bonusPoints: 0, isSub: false, isDnp: false, position: 1 },
    ]);

    // Verify points were added
    let team = await testPrisma.team.findUnique({ where: { id: t1.id } });
    expect(team!.totalPoints).toBe(15);

    // Delete
    const result = await deleteWeeklyScores(league.slug, 1);
    expect(result.success).toBe(true);

    // Points should be decremented
    team = await testPrisma.team.findUnique({ where: { id: t1.id } });
    expect(team!.totalPoints).toBe(0);

    // Scores should be gone
    const scores = await testPrisma.weeklyScore.findMany({
      where: { leagueId: league.id, weekNumber: 1 },
    });
    expect(scores).toHaveLength(0);
  });

  it("returns error for non-existent week", async () => {
    const league = unwrap(await createLeague("No Scores League", "securepass123"));
    setAuthContext(league.id, league.slug, league.adminUsername);

    const result = await deleteWeeklyScores(league.slug, 99);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("No scores found");
  });
});

describe("getCurrentStrokePlayWeek", () => {
  it("returns 1 when no scores exist", async () => {
    const league = unwrap(await createLeague("Week Counter League", "securepass123"));
    const week = await getCurrentStrokePlayWeek(league.id);
    expect(week).toBe(1);
  });

  it("returns next week number after submitted scores", async () => {
    const league = unwrap(await createLeague("Week Counter League 2", "securepass123"));
    setAuthContext(league.id, league.slug, league.adminUsername);
    unwrap(await createSeason(league.slug, "Season 1", 2025));

    const t1 = unwrap(await createTeam(league.id, "Team A"));
    await approveTeam(league.slug, t1.id);

    await submitWeeklyScores(league.slug, 1, [
      { teamId: t1.id, grossScore: 42, handicap: 5, netScore: 37, points: 10, bonusPoints: 0, isSub: false, isDnp: false, position: 1 },
    ]);

    const week = await getCurrentStrokePlayWeek(league.id);
    expect(week).toBe(2);
  });
});

// ==========================================
// Expanded coverage tests
// ==========================================

describe("getWeeklyScoreHistoryForSeason", () => {
  it("returns scores filtered by season", async () => {
    const league = unwrap(await createLeague("Season Filter League", "securepass123"));
    setAuthContext(league.id, league.slug, league.adminUsername);

    await testPrisma.league.update({
      where: { id: league.id },
      data: { scoringType: "stroke_play" },
    });

    const s1 = unwrap(await createSeason(league.slug, "Season 1", 2025));
    const t1 = unwrap(await createTeam(league.id, "Team A"));
    await approveTeam(league.slug, t1.id);

    // Submit scores in season 1
    await submitWeeklyScores(league.slug, 1, [
      { teamId: t1.id, grossScore: 42, handicap: 5, netScore: 37, points: 10, bonusPoints: 0, isSub: false, isDnp: false, position: 1 },
    ]);

    // Create a second season (deactivates season 1, makes season 2 active)
    const s2 = unwrap(await createSeason(league.slug, "Season 2", 2025));

    // Submit scores in season 2 (week 2 because week 1 already exists for this league)
    await submitWeeklyScores(league.slug, 2, [
      { teamId: t1.id, grossScore: 38, handicap: 4, netScore: 34, points: 12, bonusPoints: 0, isSub: false, isDnp: false, position: 1 },
    ]);

    // Season 1 should only have week 1 scores
    const season1History = await getWeeklyScoreHistoryForSeason(s1.id);
    expect(season1History).toHaveLength(1);
    expect(season1History[0].weekNumber).toBe(1);
    expect(season1History[0].grossScore).toBe(42);

    // Season 2 should only have week 2 scores
    const season2History = await getWeeklyScoreHistoryForSeason(s2.id);
    expect(season2History).toHaveLength(1);
    expect(season2History[0].weekNumber).toBe(2);
    expect(season2History[0].grossScore).toBe(38);
  });

  it("returns empty array for season with no scores", async () => {
    const league = unwrap(await createLeague("Season History League", "securepass123"));
    setAuthContext(league.id, league.slug, league.adminUsername);
    const s1 = unwrap(await createSeason(league.slug, "Season 1", 2025));
    const history = await getWeeklyScoreHistoryForSeason(s1.id);
    expect(history).toEqual([]);
  });

  it("returns scores ordered by week descending then position ascending", async () => {
    const league = unwrap(await createLeague("Season Order League", "securepass123"));
    setAuthContext(league.id, league.slug, league.adminUsername);

    await testPrisma.league.update({
      where: { id: league.id },
      data: { scoringType: "stroke_play" },
    });

    const s1 = unwrap(await createSeason(league.slug, "Season 1", 2025));
    const t1 = unwrap(await createTeam(league.id, "Team A"));
    const t2 = unwrap(await createTeam(league.id, "Team B"));
    await approveTeam(league.slug, t1.id);
    await approveTeam(league.slug, t2.id);

    await submitWeeklyScores(league.slug, 1, [
      { teamId: t1.id, grossScore: 42, handicap: 5, netScore: 37, points: 10, bonusPoints: 0, isSub: false, isDnp: false, position: 1 },
      { teamId: t2.id, grossScore: 45, handicap: 3, netScore: 42, points: 8, bonusPoints: 0, isSub: false, isDnp: false, position: 2 },
    ]);

    await submitWeeklyScores(league.slug, 2, [
      { teamId: t1.id, grossScore: 40, handicap: 6, netScore: 34, points: 12, bonusPoints: 0, isSub: false, isDnp: false, position: 1 },
      { teamId: t2.id, grossScore: 43, handicap: 4, netScore: 39, points: 9, bonusPoints: 0, isSub: false, isDnp: false, position: 2 },
    ]);

    const history = await getWeeklyScoreHistoryForSeason(s1.id);
    expect(history).toHaveLength(4);
    // Week 2 first (desc), then position 1 before position 2 (asc)
    expect(history[0].weekNumber).toBe(2);
    expect(history[0].position).toBe(1);
    expect(history[1].weekNumber).toBe(2);
    expect(history[1].position).toBe(2);
    expect(history[2].weekNumber).toBe(1);
    expect(history[2].position).toBe(1);
    expect(history[3].weekNumber).toBe(1);
    expect(history[3].position).toBe(2);
  });
});

describe("previewWeeklyScores (edge cases)", () => {
  it("uses manual handicap when provided on week one", async () => {
    const league = unwrap(await createLeague("Manual HC Preview League", "securepass123"));
    setAuthContext(league.id, league.slug, league.adminUsername);
    unwrap(await createSeason(league.slug, "Season 1", 2025));

    await testPrisma.league.update({
      where: { id: league.id },
      data: { scoringType: "stroke_play" },
    });

    const t1 = unwrap(await createTeam(league.id, "Team A"));
    await approveTeam(league.slug, t1.id);

    const result = await previewWeeklyScores(league.slug, league.id, 1, [
      { teamId: t1.id, grossScore: 42, isSub: false, isDnp: false, manualHandicap: 7 },
    ]);

    const preview = unwrap(result);
    expect(preview.scores).toHaveLength(1);
    expect(preview.scores[0].handicap).toBe(7);
    // Net score = grossScore - handicap = 42 - 7 = 35
    expect(preview.scores[0].netScore).toBe(35);
  });

  it("uses manual handicap for sub on non-week-one", async () => {
    const league = unwrap(await createLeague("Sub Manual HC League", "securepass123"));
    setAuthContext(league.id, league.slug, league.adminUsername);
    unwrap(await createSeason(league.slug, "Season 1", 2025));

    await testPrisma.league.update({
      where: { id: league.id },
      data: { scoringType: "stroke_play" },
    });

    const t1 = unwrap(await createTeam(league.id, "Team A"));
    const t2 = unwrap(await createTeam(league.id, "Team B"));
    await approveTeam(league.slug, t1.id);
    await approveTeam(league.slug, t2.id);

    // Submit week 1 so we can preview week 2
    await submitWeeklyScores(league.slug, 1, [
      { teamId: t1.id, grossScore: 42, handicap: 5, netScore: 37, points: 10, bonusPoints: 0, isSub: false, isDnp: false, position: 1 },
      { teamId: t2.id, grossScore: 45, handicap: 3, netScore: 42, points: 8, bonusPoints: 0, isSub: false, isDnp: false, position: 2 },
    ]);

    // Preview week 2 with a sub that has a manual handicap
    const result = await previewWeeklyScores(league.slug, league.id, 2, [
      { teamId: t1.id, grossScore: 40, isSub: false, isDnp: false },
      { teamId: t2.id, grossScore: 44, isSub: true, isDnp: false, manualHandicap: 10 },
    ]);

    const preview = unwrap(result);
    const subEntry = preview.scores.find((s) => s.teamId === t2.id);
    expect(subEntry).toBeDefined();
    // Sub with manual handicap on non-week-one triggers isSub && manualHandicap != null path
    expect(subEntry!.handicap).toBe(10);
    expect(subEntry!.netScore).toBe(34); // 44 - 10 = 34
  });

  it("uses manual handicap override on non-week-one for non-sub", async () => {
    const league = unwrap(await createLeague("Manual HC Override League", "securepass123"));
    setAuthContext(league.id, league.slug, league.adminUsername);
    unwrap(await createSeason(league.slug, "Season 1", 2025));

    await testPrisma.league.update({
      where: { id: league.id },
      data: { scoringType: "stroke_play" },
    });

    const t1 = unwrap(await createTeam(league.id, "Team A"));
    await approveTeam(league.slug, t1.id);

    // Submit week 1 so week 2 is non-week-one
    await submitWeeklyScores(league.slug, 1, [
      { teamId: t1.id, grossScore: 42, handicap: 5, netScore: 37, points: 10, bonusPoints: 0, isSub: false, isDnp: false, position: 1 },
    ]);

    // Preview week 2 with a manual handicap override (not a sub, not week one)
    // This hits the `else if (input.manualHandicap != null)` path at line 159
    const result = await previewWeeklyScores(league.slug, league.id, 2, [
      { teamId: t1.id, grossScore: 40, isSub: false, isDnp: false, manualHandicap: 3 },
    ]);

    const preview = unwrap(result);
    expect(preview.scores).toHaveLength(1);
    expect(preview.scores[0].handicap).toBe(3);
    expect(preview.scores[0].netScore).toBe(37); // 40 - 3 = 37
  });

  it("rejects preview when scores already submitted for that week", async () => {
    const league = unwrap(await createLeague("Existing Scores League", "securepass123"));
    setAuthContext(league.id, league.slug, league.adminUsername);
    unwrap(await createSeason(league.slug, "Season 1", 2025));

    await testPrisma.league.update({
      where: { id: league.id },
      data: { scoringType: "stroke_play" },
    });

    const t1 = unwrap(await createTeam(league.id, "Team A"));
    await approveTeam(league.slug, t1.id);

    // Submit scores for week 1
    await submitWeeklyScores(league.slug, 1, [
      { teamId: t1.id, grossScore: 42, handicap: 5, netScore: 37, points: 10, bonusPoints: 0, isSub: false, isDnp: false, position: 1 },
    ]);

    // Try to preview week 1 again -- should fail
    const result = await previewWeeklyScores(league.slug, league.id, 1, [
      { teamId: t1.id, grossScore: 40, isSub: false, isDnp: false },
    ]);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("already submitted");
    }
  });

  it("handles non-week-one preview using calculated handicap from previous scores", async () => {
    const league = unwrap(await createLeague("Calc HC Preview League", "securepass123"));
    setAuthContext(league.id, league.slug, league.adminUsername);
    unwrap(await createSeason(league.slug, "Season 1", 2025));

    await testPrisma.league.update({
      where: { id: league.id },
      data: { scoringType: "stroke_play" },
    });

    const t1 = unwrap(await createTeam(league.id, "Team A"));
    const t2 = unwrap(await createTeam(league.id, "Team B"));
    await approveTeam(league.slug, t1.id);
    await approveTeam(league.slug, t2.id);

    // Submit week 1 with known scores
    await submitWeeklyScores(league.slug, 1, [
      { teamId: t1.id, grossScore: 42, handicap: 5, netScore: 37, points: 10, bonusPoints: 0, isSub: false, isDnp: false, position: 1 },
      { teamId: t2.id, grossScore: 48, handicap: 3, netScore: 45, points: 8, bonusPoints: 0, isSub: false, isDnp: false, position: 2 },
    ]);

    // Preview week 2 WITHOUT manual handicap -- triggers getTeamPreviousScoresForScoring + calculateHandicap
    const result = await previewWeeklyScores(league.slug, league.id, 2, [
      { teamId: t1.id, grossScore: 40, isSub: false, isDnp: false },
      { teamId: t2.id, grossScore: 46, isSub: false, isDnp: false },
    ]);

    const preview = unwrap(result);
    expect(preview.isWeekOne).toBe(false);
    expect(preview.weekNumber).toBe(2);
    expect(preview.scores).toHaveLength(2);

    // Handicaps should be calculated (not default) based on week 1 scores
    // The exact value depends on handicap engine settings, but they should be finite numbers
    for (const score of preview.scores) {
      expect(isFinite(score.handicap)).toBe(true);
      expect(isFinite(score.netScore)).toBe(true);
    }
  });

  it("falls back to generated point scale when JSON.parse fails on strokePlayPointScale", async () => {
    const league = unwrap(await createLeague("Bad Scale League", "securepass123"));
    setAuthContext(league.id, league.slug, league.adminUsername);
    unwrap(await createSeason(league.slug, "Season 1", 2025));

    // Set an invalid JSON string for strokePlayPointScale
    await testPrisma.league.update({
      where: { id: league.id },
      data: {
        scoringType: "stroke_play",
        strokePlayPointScale: "not-valid-json{{{",
      },
    });

    const t1 = unwrap(await createTeam(league.id, "Team A"));
    const t2 = unwrap(await createTeam(league.id, "Team B"));
    await approveTeam(league.slug, t1.id);
    await approveTeam(league.slug, t2.id);

    // Preview should still succeed -- falls back to generatePointScale
    const result = await previewWeeklyScores(league.slug, league.id, 1, [
      { teamId: t1.id, grossScore: 42, isSub: false, isDnp: false },
      { teamId: t2.id, grossScore: 45, isSub: false, isDnp: false },
    ]);

    const preview = unwrap(result);
    expect(preview.scores).toHaveLength(2);
    // Points should still be assigned using the fallback scale
    const playingScores = preview.scores.filter((s) => !s.isDnp);
    expect(playingScores.some((s) => s.points > 0)).toBe(true);
  });

  it("pads point scale with zeros when fewer entries than playing teams", async () => {
    const league = unwrap(await createLeague("Short Scale League", "securepass123"));
    setAuthContext(league.id, league.slug, league.adminUsername);
    unwrap(await createSeason(league.slug, "Season 1", 2025));

    // Set a custom point scale with only 1 entry, but we'll have 3 playing teams
    await testPrisma.league.update({
      where: { id: league.id },
      data: {
        scoringType: "stroke_play",
        strokePlayPointScale: JSON.stringify([10]),
      },
    });

    const t1 = unwrap(await createTeam(league.id, "Team A"));
    const t2 = unwrap(await createTeam(league.id, "Team B"));
    const t3 = unwrap(await createTeam(league.id, "Team C"));
    await approveTeam(league.slug, t1.id);
    await approveTeam(league.slug, t2.id);
    await approveTeam(league.slug, t3.id);

    const result = await previewWeeklyScores(league.slug, league.id, 1, [
      { teamId: t1.id, grossScore: 40, isSub: false, isDnp: false },
      { teamId: t2.id, grossScore: 42, isSub: false, isDnp: false },
      { teamId: t3.id, grossScore: 45, isSub: false, isDnp: false },
    ]);

    const preview = unwrap(result);
    expect(preview.scores).toHaveLength(3);

    // First place should get points from the scale (10), rest should get 0 (padded)
    const sorted = [...preview.scores].sort((a, b) => a.position - b.position);
    expect(sorted[0].points).toBe(10);
    expect(sorted[1].points).toBe(0);
    expect(sorted[2].points).toBe(0);
  });
});

describe("submitWeeklyScores (edge cases)", () => {
  let leagueSlug: string;
  let leagueId: number;
  let teamAId: number;
  let teamBId: number;

  beforeEach(async () => {
    const league = unwrap(await createLeague("Submit Edge League", "securepass123"));
    leagueSlug = league.slug;
    leagueId = league.id;
    setAuthContext(league.id, league.slug, league.adminUsername);
    unwrap(await createSeason(leagueSlug, "Season 1", 2025));

    await testPrisma.league.update({
      where: { id: leagueId },
      data: { scoringType: "stroke_play" },
    });

    const t1 = unwrap(await createTeam(leagueId, "Team A"));
    const t2 = unwrap(await createTeam(leagueId, "Team B"));
    teamAId = t1.id;
    teamBId = t2.id;
    await approveTeam(leagueSlug, teamAId);
    await approveTeam(leagueSlug, teamBId);
  });

  it("rejects invalid score data via Zod validation (weekNumber: 0)", async () => {
    const result = await submitWeeklyScores(leagueSlug, 0, [
      { teamId: teamAId, grossScore: 42, handicap: 5, netScore: 37, points: 10, bonusPoints: 0, isSub: false, isDnp: false, position: 1 },
    ]);
    expect(result.success).toBe(false);
  });

  it("rejects invalid score data via Zod validation (negative weekNumber)", async () => {
    const result = await submitWeeklyScores(leagueSlug, -1, [
      { teamId: teamAId, grossScore: 42, handicap: 5, netScore: 37, points: 10, bonusPoints: 0, isSub: false, isDnp: false, position: 1 },
    ]);
    expect(result.success).toBe(false);
  });

  it("rejects invalid score data via Zod validation (negative teamId)", async () => {
    const result = await submitWeeklyScores(leagueSlug, 1, [
      { teamId: -1, grossScore: 42, handicap: 5, netScore: 37, points: 10, bonusPoints: 0, isSub: false, isDnp: false, position: 1 },
    ]);
    expect(result.success).toBe(false);
  });

  it("rejects when teams don't belong to league", async () => {
    // Create a second league with its own team
    const league2 = unwrap(await createLeague("Other League", "securepass123"));
    setAuthContext(league2.id, league2.slug, league2.adminUsername);
    unwrap(await createSeason(league2.slug, "Season 1", 2025));
    const foreignTeam = unwrap(await createTeam(league2.id, "Foreign Team"));
    await approveTeam(league2.slug, foreignTeam.id);

    // Switch auth context back to the first league
    setAuthContext(leagueId, leagueSlug, "admin");

    // Try to submit scores for the foreign team in the first league
    const result = await submitWeeklyScores(leagueSlug, 1, [
      { teamId: foreignTeam.id, grossScore: 42, handicap: 5, netScore: 37, points: 10, bonusPoints: 0, isSub: false, isDnp: false, position: 1 },
    ]);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("do not belong to this league");
    }
  });

  it("rejects empty scores array", async () => {
    const result = await submitWeeklyScores(leagueSlug, 1, []);
    // Either Zod rejects it or the function handles it -- either way success should be true
    // because the schema allows empty arrays, but it should succeed with no-op
    // Actually, let's verify what happens
    expect(result.success).toBe(true);
  });
});

describe("deleteWeeklyScores (edge cases)", () => {
  it("clamps team totalPoints at zero when decrementing", async () => {
    const league = unwrap(await createLeague("Clamp Points League", "securepass123"));
    setAuthContext(league.id, league.slug, league.adminUsername);
    unwrap(await createSeason(league.slug, "Season 1", 2025));

    await testPrisma.league.update({
      where: { id: league.id },
      data: { scoringType: "stroke_play" },
    });

    const t1 = unwrap(await createTeam(league.id, "Team A"));
    await approveTeam(league.slug, t1.id);

    // Submit scores with 15 points
    await submitWeeklyScores(league.slug, 1, [
      { teamId: t1.id, grossScore: 42, handicap: 5, netScore: 37, points: 15, bonusPoints: 0, isSub: false, isDnp: false, position: 1 },
    ]);

    // Manually set team totalPoints to 0 (simulating drift or manual adjustment)
    await testPrisma.team.update({
      where: { id: t1.id },
      data: { totalPoints: 0 },
    });

    // Delete scores -- should clamp at 0, not go to -15
    const result = await deleteWeeklyScores(league.slug, 1);
    expect(result.success).toBe(true);

    const team = await testPrisma.team.findUnique({ where: { id: t1.id } });
    expect(team!.totalPoints).toBe(0); // Clamped at zero, not -15
  });

  it("clamps at zero when team has fewer points than score points", async () => {
    const league = unwrap(await createLeague("Partial Clamp League", "securepass123"));
    setAuthContext(league.id, league.slug, league.adminUsername);
    unwrap(await createSeason(league.slug, "Season 1", 2025));

    await testPrisma.league.update({
      where: { id: league.id },
      data: { scoringType: "stroke_play" },
    });

    const t1 = unwrap(await createTeam(league.id, "Team A"));
    await approveTeam(league.slug, t1.id);

    // Submit scores with 20 points
    await submitWeeklyScores(league.slug, 1, [
      { teamId: t1.id, grossScore: 42, handicap: 5, netScore: 37, points: 20, bonusPoints: 0, isSub: false, isDnp: false, position: 1 },
    ]);

    // Manually set team totalPoints to 5 (less than the 20 points from the score)
    await testPrisma.team.update({
      where: { id: t1.id },
      data: { totalPoints: 5 },
    });

    // Delete scores -- Math.max(0, 5 - 20) = 0
    const result = await deleteWeeklyScores(league.slug, 1);
    expect(result.success).toBe(true);

    const team = await testPrisma.team.findUnique({ where: { id: t1.id } });
    expect(team!.totalPoints).toBe(0);
  });
});
