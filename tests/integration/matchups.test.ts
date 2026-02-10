import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { PrismaClient } from "../../src/generated/prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import path from "path";

// ==========================================
// Test database + shared mock state
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
    login: { maxRequests: 100, windowSeconds: 60 },
    sudoLogin: { maxRequests: 100, windowSeconds: 60 },
    createLeague: { maxRequests: 100, windowSeconds: 60 },
    registerTeam: { maxRequests: 100, windowSeconds: 60 },
    scorecardSave: { maxRequests: 100, windowSeconds: 60 },
  },
}));

// ==========================================
// Imports (after mocks)
// ==========================================

import { createLeague } from "@/lib/actions/leagues";
import { createSeason } from "@/lib/actions/seasons";
import { createTeam, approveTeam } from "@/lib/actions/teams";
import {
  previewMatchup,
  submitMatchup,
  deleteMatchup,
  submitForfeit,
  getMatchupHistory,
  getTeamMatchupHistory,
  getMatchupsForWeek,
  getMatchupHistoryForSeason,
} from "@/lib/actions/matchups";
import { requireAdmin, requireLeagueAdmin } from "@/lib/auth";

const mockedRequireAdmin = vi.mocked(requireAdmin);
const mockedRequireLeagueAdmin = vi.mocked(requireLeagueAdmin);

function setAuthContext(leagueId: number, leagueSlug: string, adminUsername: string) {
  mockedRequireAdmin.mockResolvedValue({ leagueId, leagueSlug, adminUsername });
  mockedRequireLeagueAdmin.mockImplementation(async (slug: string) => {
    if (slug !== leagueSlug) throw new Error("Unauthorized");
    return { leagueId, leagueSlug, adminUsername };
  });
}

// ==========================================
// Helpers
// ==========================================

function unwrap<T>(result: { success: true; data: T } | { success: false; error: string }): T {
  if (!result.success) {
    throw new Error(`Expected success but got error: ${result.error}`);
  }
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

/**
 * Scaffold a league with an active season and two approved teams.
 * Returns { leagueId, leagueSlug, adminUsername, seasonId, teamAId, teamBId }.
 */
async function setupLeagueWithTeams(leagueName: string) {
  const league = unwrap(await createLeague(leagueName, "securepass123"));
  setAuthContext(league.id, league.slug, league.adminUsername);
  const season = unwrap(await createSeason(league.slug, "Season 1", 2025));
  const teamA = unwrap(await createTeam(league.id, "Team Alpha"));
  const teamB = unwrap(await createTeam(league.id, "Team Beta"));
  await approveTeam(league.slug, teamA.id);
  await approveTeam(league.slug, teamB.id);
  return {
    leagueId: league.id,
    leagueSlug: league.slug,
    adminUsername: league.adminUsername,
    seasonId: season.id,
    teamAId: teamA.id,
    teamBId: teamB.id,
  };
}

// ==========================================
// Lifecycle
// ==========================================

beforeAll(async () => {
  await cleanDatabase();
});

afterAll(async () => {
  await cleanDatabase();
  await testPrisma.$disconnect();
});

beforeEach(async () => {
  await cleanDatabase();
});

// ==========================================
// previewMatchup
// ==========================================

describe("previewMatchup", () => {
  it("generates a preview for week 1 with default handicaps", async () => {
    const ctx = await setupLeagueWithTeams("Preview Default League");

    const result = await previewMatchup(
      ctx.leagueSlug,
      1,                // weekNumber
      ctx.teamAId,
      42,               // teamA gross
      null,             // teamA handicap manual (null => use default)
      false,            // teamA isSub
      ctx.teamBId,
      45,               // teamB gross
      null,             // teamB handicap manual
      false             // teamB isSub
    );

    expect(result.success).toBe(true);
    if (!result.success) return;
    const preview = result.data;

    expect(preview.isWeekOne).toBe(true);
    expect(preview.weekNumber).toBe(1);
    expect(preview.teamAId).toBe(ctx.teamAId);
    expect(preview.teamBId).toBe(ctx.teamBId);
    expect(preview.teamAGross).toBe(42);
    expect(preview.teamBGross).toBe(45);
    // Default handicap is 0 for new leagues, so net === gross
    expect(preview.teamAHandicap).toBe(0);
    expect(preview.teamBHandicap).toBe(0);
    expect(preview.teamANet).toBe(42);
    expect(preview.teamBNet).toBe(45);
    // Points should be suggested — lower net wins
    expect(preview.teamAPoints).toBeGreaterThan(preview.teamBPoints);
    expect(preview.teamAPoints + preview.teamBPoints).toBe(20);
  });

  it("uses manual handicap on week 1 when provided", async () => {
    const ctx = await setupLeagueWithTeams("Preview Manual HC League");

    const result = await previewMatchup(
      ctx.leagueSlug,
      1,
      ctx.teamAId,
      42,
      5,             // manual handicap for team A
      false,
      ctx.teamBId,
      45,
      3,             // manual handicap for team B
      false
    );

    expect(result.success).toBe(true);
    if (!result.success) return;
    const preview = result.data;

    expect(preview.teamAHandicap).toBe(5);
    expect(preview.teamBHandicap).toBe(3);
    // Net: 42 - 5 = 37 vs 45 - 3 = 42
    expect(preview.teamANet).toBe(37);
    expect(preview.teamBNet).toBe(42);
  });

  it("detects duplicate matchup when team already played that week", async () => {
    const ctx = await setupLeagueWithTeams("Preview Dup League");

    // Submit an actual matchup for week 1
    await submitMatchup(
      ctx.leagueSlug, 1,
      ctx.teamAId, 40, 0, 40, 20, false,
      ctx.teamBId, 45, 0, 45, 0, false
    );

    // Preview for same week with team A should fail
    const result = await previewMatchup(
      ctx.leagueSlug,
      1,
      ctx.teamAId,
      42, null, false,
      ctx.teamBId,
      45, null, false
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("already played in Week 1");
    }
  });

  it("uses sub manual handicap for non-week-1 when isSub and manual is provided", async () => {
    const ctx = await setupLeagueWithTeams("Preview Sub League");

    // Create a week 1 matchup so week 2 is not week 1
    await submitMatchup(
      ctx.leagueSlug, 1,
      ctx.teamAId, 40, 0, 40, 20, false,
      ctx.teamBId, 45, 0, 45, 0, false
    );

    // Create a third team for the week 2 preview
    const teamC = unwrap(await createTeam(ctx.leagueId, "Team Charlie"));
    await approveTeam(ctx.leagueSlug, teamC.id);

    // Preview week 2 with team A as sub with manual handicap
    const result = await previewMatchup(
      ctx.leagueSlug,
      2,
      ctx.teamAId,
      42,
      7,            // manual handicap for sub
      true,         // isSub
      teamC.id,
      44,
      null,
      false
    );

    expect(result.success).toBe(true);
    if (!result.success) return;
    const preview = result.data;

    expect(preview.isWeekOne).toBe(false);
    expect(preview.teamAIsSub).toBe(true);
    expect(preview.teamAHandicap).toBe(7);
  });

  it("calculates handicap from previous scores for week 2+", async () => {
    const ctx = await setupLeagueWithTeams("Preview Handicap Calc League");

    // Submit week 1 with known scores
    await submitMatchup(
      ctx.leagueSlug, 1,
      ctx.teamAId, 42, 0, 42, 10, false,
      ctx.teamBId, 42, 0, 42, 10, false
    );

    // Preview week 2 — handicap should be calculated from week 1 scores
    const result = await previewMatchup(
      ctx.leagueSlug,
      2,
      ctx.teamAId,
      40,
      null,
      false,
      ctx.teamBId,
      44,
      null,
      false
    );

    expect(result.success).toBe(true);
    if (!result.success) return;
    const preview = result.data;

    expect(preview.isWeekOne).toBe(false);
    // Handicap is calculated: (avg_score - base_score) * multiplier
    // base_score defaults to 35, multiplier to 0.9
    // Team A: (42 - 35) * 0.9 = 6.3 => floored to 6
    expect(preview.teamAHandicap).toBe(6);
    expect(preview.teamBHandicap).toBe(6);
  });
});

// ==========================================
// getMatchupHistory
// ==========================================

describe("getMatchupHistory", () => {
  it("returns matchups with team data ordered by week desc", async () => {
    const ctx = await setupLeagueWithTeams("History League");

    // Submit matchups for weeks 1 and 2
    await submitMatchup(
      ctx.leagueSlug, 1,
      ctx.teamAId, 40, 0, 40, 20, false,
      ctx.teamBId, 45, 0, 45, 0, false
    );

    // Need a third team for week 2 since teams can only play once per week
    const teamC = unwrap(await createTeam(ctx.leagueId, "Team Charlie"));
    await approveTeam(ctx.leagueSlug, teamC.id);

    await submitMatchup(
      ctx.leagueSlug, 2,
      ctx.teamAId, 38, 0, 38, 20, false,
      teamC.id, 44, 0, 44, 0, false
    );

    const { matchups, hasMore } = await getMatchupHistory(ctx.leagueId);

    expect(matchups.length).toBe(2);
    expect(hasMore).toBe(false);
    // Ordered by weekNumber desc: week 2 first
    expect(matchups[0].weekNumber).toBe(2);
    expect(matchups[1].weekNumber).toBe(1);
    // Team data included
    expect(matchups[0].teamA.name).toBe("Team Alpha");
    expect(matchups[1].teamB.name).toBe("Team Beta");
  });

  it("returns empty result when no matchups exist", async () => {
    const ctx = await setupLeagueWithTeams("Empty History League");

    const { matchups, hasMore } = await getMatchupHistory(ctx.leagueId);

    expect(matchups).toHaveLength(0);
    expect(hasMore).toBe(false);
  });

  it("respects limit and returns hasMore flag", async () => {
    const ctx = await setupLeagueWithTeams("Limit History League");

    // Create 3 more teams for 3 different week matchups
    const teamC = unwrap(await createTeam(ctx.leagueId, "Team Charlie"));
    const teamD = unwrap(await createTeam(ctx.leagueId, "Team Delta"));
    const teamE = unwrap(await createTeam(ctx.leagueId, "Team Echo"));
    await approveTeam(ctx.leagueSlug, teamC.id);
    await approveTeam(ctx.leagueSlug, teamD.id);
    await approveTeam(ctx.leagueSlug, teamE.id);

    await submitMatchup(
      ctx.leagueSlug, 1,
      ctx.teamAId, 40, 0, 40, 20, false,
      ctx.teamBId, 45, 0, 45, 0, false
    );
    await submitMatchup(
      ctx.leagueSlug, 2,
      teamC.id, 40, 0, 40, 20, false,
      teamD.id, 45, 0, 45, 0, false
    );
    await submitMatchup(
      ctx.leagueSlug, 3,
      ctx.teamAId, 38, 0, 38, 20, false,
      teamE.id, 44, 0, 44, 0, false
    );

    const { matchups, hasMore } = await getMatchupHistory(ctx.leagueId, 2);

    expect(matchups).toHaveLength(2);
    expect(hasMore).toBe(true);
    // First two by week desc: weeks 3 and 2
    expect(matchups[0].weekNumber).toBe(3);
    expect(matchups[1].weekNumber).toBe(2);
  });
});

// ==========================================
// getTeamMatchupHistory
// ==========================================

describe("getTeamMatchupHistory", () => {
  it("returns only matchups involving the specified team", async () => {
    const ctx = await setupLeagueWithTeams("Team History League");

    const teamC = unwrap(await createTeam(ctx.leagueId, "Team Charlie"));
    await approveTeam(ctx.leagueSlug, teamC.id);

    // Week 1: A vs B
    await submitMatchup(
      ctx.leagueSlug, 1,
      ctx.teamAId, 40, 0, 40, 20, false,
      ctx.teamBId, 45, 0, 45, 0, false
    );
    // Week 2: A vs C
    await submitMatchup(
      ctx.leagueSlug, 2,
      ctx.teamAId, 38, 0, 38, 20, false,
      teamC.id, 44, 0, 44, 0, false
    );
    // Week 3: B vs C (team A not involved)
    await submitMatchup(
      ctx.leagueSlug, 3,
      ctx.teamBId, 40, 0, 40, 20, false,
      teamC.id, 45, 0, 45, 0, false
    );

    const { matchups, hasMore } = await getTeamMatchupHistory(ctx.leagueId, ctx.teamAId);

    expect(matchups).toHaveLength(2);
    expect(hasMore).toBe(false);
    // All matchups should involve team A
    for (const m of matchups) {
      expect(m.teamAId === ctx.teamAId || m.teamBId === ctx.teamAId).toBe(true);
    }
  });

  it("respects limit and returns hasMore for team history", async () => {
    const ctx = await setupLeagueWithTeams("Team Limit League");

    const teamC = unwrap(await createTeam(ctx.leagueId, "Team Charlie"));
    const teamD = unwrap(await createTeam(ctx.leagueId, "Team Delta"));
    await approveTeam(ctx.leagueSlug, teamC.id);
    await approveTeam(ctx.leagueSlug, teamD.id);

    // Create 3 matchups for team A
    await submitMatchup(
      ctx.leagueSlug, 1,
      ctx.teamAId, 40, 0, 40, 20, false,
      ctx.teamBId, 45, 0, 45, 0, false
    );
    await submitMatchup(
      ctx.leagueSlug, 2,
      ctx.teamAId, 38, 0, 38, 20, false,
      teamC.id, 44, 0, 44, 0, false
    );
    await submitMatchup(
      ctx.leagueSlug, 3,
      ctx.teamAId, 36, 0, 36, 20, false,
      teamD.id, 46, 0, 46, 0, false
    );

    const { matchups, hasMore } = await getTeamMatchupHistory(ctx.leagueId, ctx.teamAId, 2);

    expect(matchups).toHaveLength(2);
    expect(hasMore).toBe(true);
  });
});

// ==========================================
// deleteMatchup
// ==========================================

describe("deleteMatchup", () => {
  it("deletes matchup and reverses winner/loser stats", async () => {
    const ctx = await setupLeagueWithTeams("Delete Stats League");

    // Team A wins 20-0
    await submitMatchup(
      ctx.leagueSlug, 1,
      ctx.teamAId, 40, 5, 35, 20, false,
      ctx.teamBId, 45, 5, 40, 0, false
    );

    // Verify stats are set
    let teamA = await testPrisma.team.findUnique({ where: { id: ctx.teamAId } });
    let teamB = await testPrisma.team.findUnique({ where: { id: ctx.teamBId } });
    expect(teamA!.wins).toBe(1);
    expect(teamA!.totalPoints).toBe(20);
    expect(teamB!.losses).toBe(1);
    expect(teamB!.totalPoints).toBe(0);

    const matchup = await testPrisma.matchup.findFirst({ where: { weekNumber: 1, leagueId: ctx.leagueId } });
    const result = await deleteMatchup(ctx.leagueSlug, matchup!.id);
    expect(result.success).toBe(true);

    // Stats should be rolled back
    teamA = await testPrisma.team.findUnique({ where: { id: ctx.teamAId } });
    teamB = await testPrisma.team.findUnique({ where: { id: ctx.teamBId } });
    expect(teamA!.wins).toBe(0);
    expect(teamA!.totalPoints).toBe(0);
    expect(teamB!.losses).toBe(0);
    expect(teamB!.totalPoints).toBe(0);
  });

  it("reverses tie stats correctly", async () => {
    const ctx = await setupLeagueWithTeams("Delete Tie League");

    // Tied matchup: 10-10
    await submitMatchup(
      ctx.leagueSlug, 1,
      ctx.teamAId, 40, 5, 35, 10, false,
      ctx.teamBId, 40, 5, 35, 10, false
    );

    let teamA = await testPrisma.team.findUnique({ where: { id: ctx.teamAId } });
    let teamB = await testPrisma.team.findUnique({ where: { id: ctx.teamBId } });
    expect(teamA!.ties).toBe(1);
    expect(teamB!.ties).toBe(1);

    const matchup = await testPrisma.matchup.findFirst({ where: { weekNumber: 1, leagueId: ctx.leagueId } });
    await deleteMatchup(ctx.leagueSlug, matchup!.id);

    teamA = await testPrisma.team.findUnique({ where: { id: ctx.teamAId } });
    teamB = await testPrisma.team.findUnique({ where: { id: ctx.teamBId } });
    expect(teamA!.ties).toBe(0);
    expect(teamB!.ties).toBe(0);
    expect(teamA!.totalPoints).toBe(0);
    expect(teamB!.totalPoints).toBe(0);
  });

  it("clamps stats at zero (does not go negative)", async () => {
    const ctx = await setupLeagueWithTeams("Delete Clamp League");

    // Submit matchup — A wins
    await submitMatchup(
      ctx.leagueSlug, 1,
      ctx.teamAId, 40, 0, 40, 20, false,
      ctx.teamBId, 45, 0, 45, 0, false
    );

    // Manually corrupt stats to 0 (simulating previous deletion or bug)
    await testPrisma.team.update({
      where: { id: ctx.teamAId },
      data: { totalPoints: 0, wins: 0 },
    });

    const matchup = await testPrisma.matchup.findFirst({ where: { weekNumber: 1, leagueId: ctx.leagueId } });
    const result = await deleteMatchup(ctx.leagueSlug, matchup!.id);
    expect(result.success).toBe(true);

    // Stats should clamp at 0, not go negative
    const teamA = await testPrisma.team.findUnique({ where: { id: ctx.teamAId } });
    expect(teamA!.totalPoints).toBe(0);
    expect(teamA!.wins).toBe(0);
  });

  it("reverts linked scheduled matchup to scheduled status", async () => {
    const ctx = await setupLeagueWithTeams("Delete Scheduled League");

    // Create a scheduled matchup manually
    const scheduled = await testPrisma.scheduledMatchup.create({
      data: {
        leagueId: ctx.leagueId,
        seasonId: ctx.seasonId,
        weekNumber: 1,
        teamAId: ctx.teamAId,
        teamBId: ctx.teamBId,
        status: "scheduled",
      },
    });

    // Submit the matchup (this should link the scheduled matchup)
    await submitMatchup(
      ctx.leagueSlug, 1,
      ctx.teamAId, 40, 0, 40, 20, false,
      ctx.teamBId, 45, 0, 45, 0, false
    );

    // Verify the scheduled matchup was linked
    let scheduledUpdated = await testPrisma.scheduledMatchup.findUnique({ where: { id: scheduled.id } });
    expect(scheduledUpdated!.status).toBe("completed");
    expect(scheduledUpdated!.matchupId).not.toBeNull();

    // Delete the matchup
    const matchup = await testPrisma.matchup.findFirst({ where: { weekNumber: 1, leagueId: ctx.leagueId } });
    await deleteMatchup(ctx.leagueSlug, matchup!.id);

    // Scheduled matchup should revert to "scheduled"
    scheduledUpdated = await testPrisma.scheduledMatchup.findUnique({ where: { id: scheduled.id } });
    expect(scheduledUpdated!.status).toBe("scheduled");
    expect(scheduledUpdated!.matchupId).toBeNull();
  });
});

// ==========================================
// submitForfeit
// ==========================================

describe("submitForfeit", () => {
  it("creates a 20-0 forfeit matchup and updates winner stats", async () => {
    const ctx = await setupLeagueWithTeams("Forfeit League");

    const result = await submitForfeit(ctx.leagueSlug, 1, ctx.teamAId, ctx.teamBId);
    expect(result.success).toBe(true);

    // Verify the matchup was created
    const matchup = await testPrisma.matchup.findFirst({
      where: { leagueId: ctx.leagueId, weekNumber: 1 },
    });
    expect(matchup).not.toBeNull();
    expect(matchup!.isForfeit).toBe(true);
    expect(matchup!.forfeitTeamId).toBe(ctx.teamBId);
    expect(matchup!.teamAId).toBe(ctx.teamAId);
    expect(matchup!.teamAPoints).toBe(20);
    expect(matchup!.teamBPoints).toBe(0);
    expect(matchup!.teamAGross).toBe(0);
    expect(matchup!.teamBGross).toBe(0);

    // Winner gets 20 points and a win
    const winner = await testPrisma.team.findUnique({ where: { id: ctx.teamAId } });
    expect(winner!.totalPoints).toBe(20);
    expect(winner!.wins).toBe(1);

    // Forfeiter gets a loss
    const forfeiter = await testPrisma.team.findUnique({ where: { id: ctx.teamBId } });
    expect(forfeiter!.losses).toBe(1);
    expect(forfeiter!.totalPoints).toBe(0);
  });

  it("rejects forfeit when winning and forfeiting team are the same", async () => {
    const ctx = await setupLeagueWithTeams("Forfeit Same Team League");

    const result = await submitForfeit(ctx.leagueSlug, 1, ctx.teamAId, ctx.teamAId);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("different");
    }
  });

  it("rejects forfeit when a team already played that week", async () => {
    const ctx = await setupLeagueWithTeams("Forfeit Dup League");

    // Submit a regular matchup first
    await submitMatchup(
      ctx.leagueSlug, 1,
      ctx.teamAId, 40, 0, 40, 20, false,
      ctx.teamBId, 45, 0, 45, 0, false
    );

    // Create a third team
    const teamC = unwrap(await createTeam(ctx.leagueId, "Team Charlie"));
    await approveTeam(ctx.leagueSlug, teamC.id);

    // Try to forfeit for team A who already played week 1
    const result = await submitForfeit(ctx.leagueSlug, 1, ctx.teamAId, teamC.id);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("already played");
    }
  });

  it("rejects forfeit with invalid week number", async () => {
    const ctx = await setupLeagueWithTeams("Forfeit Invalid Week League");

    const result = await submitForfeit(ctx.leagueSlug, 0, ctx.teamAId, ctx.teamBId);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("Week number must be at least 1");
    }
  });
});

// ==========================================
// getMatchupsForWeek
// ==========================================

describe("getMatchupsForWeek", () => {
  it("returns simplified matchup data for a specific week", async () => {
    const ctx = await setupLeagueWithTeams("Week Matchups League");

    await submitMatchup(
      ctx.leagueSlug, 1,
      ctx.teamAId, 40, 0, 40, 20, false,
      ctx.teamBId, 45, 0, 45, 0, false
    );

    const matchups = await getMatchupsForWeek(ctx.leagueId, 1);

    expect(matchups).toHaveLength(1);
    expect(matchups[0].teamAId).toBe(ctx.teamAId);
    expect(matchups[0].teamBId).toBe(ctx.teamBId);
    expect(matchups[0].teamAName).toBe("Team Alpha");
    expect(matchups[0].teamBName).toBe("Team Beta");
    expect(matchups[0].id).toBeDefined();
  });

  it("returns empty array for week with no matchups", async () => {
    const ctx = await setupLeagueWithTeams("Week Empty League");

    const matchups = await getMatchupsForWeek(ctx.leagueId, 5);
    expect(matchups).toHaveLength(0);
  });

  it("returns multiple matchups for a week with multiple games", async () => {
    const ctx = await setupLeagueWithTeams("Week Multi League");

    const teamC = unwrap(await createTeam(ctx.leagueId, "Team Charlie"));
    const teamD = unwrap(await createTeam(ctx.leagueId, "Team Delta"));
    await approveTeam(ctx.leagueSlug, teamC.id);
    await approveTeam(ctx.leagueSlug, teamD.id);

    await submitMatchup(
      ctx.leagueSlug, 1,
      ctx.teamAId, 40, 0, 40, 20, false,
      ctx.teamBId, 45, 0, 45, 0, false
    );
    await submitMatchup(
      ctx.leagueSlug, 1,
      teamC.id, 38, 0, 38, 20, false,
      teamD.id, 46, 0, 46, 0, false
    );

    const matchups = await getMatchupsForWeek(ctx.leagueId, 1);
    expect(matchups).toHaveLength(2);
  });
});

// ==========================================
// getMatchupHistoryForSeason
// ==========================================

describe("getMatchupHistoryForSeason", () => {
  it("returns matchups filtered by season", async () => {
    const ctx = await setupLeagueWithTeams("Season Filter League");

    // Submit a matchup in season 1
    await submitMatchup(
      ctx.leagueSlug, 1,
      ctx.teamAId, 40, 0, 40, 20, false,
      ctx.teamBId, 45, 0, 45, 0, false
    );

    // Create season 2
    const season2 = unwrap(await createSeason(ctx.leagueSlug, "Season 2", 2025));

    // Create teams for season 2
    const teamC = unwrap(await createTeam(ctx.leagueId, "Team Charlie"));
    const teamD = unwrap(await createTeam(ctx.leagueId, "Team Delta"));
    await approveTeam(ctx.leagueSlug, teamC.id);
    await approveTeam(ctx.leagueSlug, teamD.id);

    // Submit a matchup in season 2
    await submitMatchup(
      ctx.leagueSlug, 1,
      teamC.id, 38, 0, 38, 20, false,
      teamD.id, 44, 0, 44, 0, false
    );

    // Query season 1 matchups
    const s1Result = await getMatchupHistoryForSeason(ctx.seasonId);
    expect(s1Result.matchups).toHaveLength(1);
    expect(s1Result.matchups[0].teamA.name).toBe("Team Alpha");

    // Query season 2 matchups
    const s2Result = await getMatchupHistoryForSeason(season2.id);
    expect(s2Result.matchups).toHaveLength(1);
    expect(s2Result.matchups[0].teamA.name).toBe("Team Charlie");
  });

  it("returns empty result for season with no matchups", async () => {
    const ctx = await setupLeagueWithTeams("Season Empty League");

    const { matchups, hasMore } = await getMatchupHistoryForSeason(ctx.seasonId);
    expect(matchups).toHaveLength(0);
    expect(hasMore).toBe(false);
  });

  it("respects limit and returns hasMore flag for season history", async () => {
    const ctx = await setupLeagueWithTeams("Season Limit League");

    const teamC = unwrap(await createTeam(ctx.leagueId, "Team Charlie"));
    const teamD = unwrap(await createTeam(ctx.leagueId, "Team Delta"));
    const teamE = unwrap(await createTeam(ctx.leagueId, "Team Echo"));
    await approveTeam(ctx.leagueSlug, teamC.id);
    await approveTeam(ctx.leagueSlug, teamD.id);
    await approveTeam(ctx.leagueSlug, teamE.id);

    await submitMatchup(
      ctx.leagueSlug, 1,
      ctx.teamAId, 40, 0, 40, 20, false,
      ctx.teamBId, 45, 0, 45, 0, false
    );
    await submitMatchup(
      ctx.leagueSlug, 2,
      teamC.id, 38, 0, 38, 20, false,
      teamD.id, 44, 0, 44, 0, false
    );
    await submitMatchup(
      ctx.leagueSlug, 3,
      ctx.teamAId, 36, 0, 36, 20, false,
      teamE.id, 46, 0, 46, 0, false
    );

    const { matchups, hasMore } = await getMatchupHistoryForSeason(ctx.seasonId, 2);
    expect(matchups).toHaveLength(2);
    expect(hasMore).toBe(true);
  });
});
