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
  previewSchedule,
  generateSchedule,
  clearSchedule,
  getSchedule,
  getScheduleForWeek,
  getScheduleStatus,
  getTeamSchedule,
  swapTeamsInMatchup,
  cancelScheduledMatchup,
  rescheduleMatchup,
  addManualScheduledMatchup,
  processByeWeekPoints,
  addTeamToSchedule,
  removeTeamFromSchedule,
} from "@/lib/actions/schedule";
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

async function setupLeagueWithTeams(teamCount: number) {
  const league = unwrap(await createLeague(`Schedule Test ${Date.now()}`, "securepass123"));
  setAuthContext(league.id, league.slug, league.adminUsername);
  unwrap(await createSeason(league.slug, "Season 1", 2025));

  const teamIds: number[] = [];
  for (let i = 0; i < teamCount; i++) {
    const team = unwrap(await createTeam(league.id, `Team ${String.fromCharCode(65 + i)}`));
    await approveTeam(league.slug, team.id);
    teamIds.push(team.id);
  }

  return { league, teamIds };
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

describe("previewSchedule", () => {
  it("returns rounds for single round-robin with 4 teams", async () => {
    const { league } = await setupLeagueWithTeams(4);
    const result = await previewSchedule(league.slug, league.id, {
      type: "single_round_robin",
      totalWeeks: 10,
    });
    const rounds = unwrap(result);

    expect(rounds.length).toBeGreaterThan(0);
    // 4 teams, single round-robin = 3 rounds
    expect(rounds.length).toBe(3);
  });

  it("returns rounds for double round-robin", async () => {
    const { league } = await setupLeagueWithTeams(4);
    const result = await previewSchedule(league.slug, league.id, {
      type: "double_round_robin",
      totalWeeks: 10,
    });
    const rounds = unwrap(result);

    // 4 teams, double round-robin = 6 rounds
    expect(rounds.length).toBe(6);
  });

  it("returns error with fewer than 2 teams", async () => {
    const league = unwrap(await createLeague("Solo League", "securepass123"));
    setAuthContext(league.id, league.slug, league.adminUsername);
    unwrap(await createSeason(league.slug, "Season 1", 2025));
    unwrap(await createTeam(league.id, "Only Team"));

    const result = await previewSchedule(league.slug, league.id, {
      type: "single_round_robin",
      totalWeeks: 10,
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("at least 2");
  });
});

describe("generateSchedule", () => {
  it("creates scheduled matchups in the database", async () => {
    const { league } = await setupLeagueWithTeams(4);
    const result = await generateSchedule(league.slug, {
      type: "single_round_robin",
      totalWeeks: 10,
    });
    const data = unwrap(result);

    expect(data.weeksGenerated).toBe(3);

    // Verify matchups exist in DB
    const matchups = await testPrisma.scheduledMatchup.findMany({
      where: { leagueId: league.id },
    });
    expect(matchups.length).toBeGreaterThan(0);
    // 4 teams = 2 matches per round, 3 rounds = 6 matchups
    expect(matchups.length).toBe(6);
  });

  it("updates league scheduleType", async () => {
    const { league } = await setupLeagueWithTeams(4);
    await generateSchedule(league.slug, {
      type: "single_round_robin",
      totalWeeks: 10,
    });

    const updated = await testPrisma.league.findUnique({ where: { id: league.id } });
    expect(updated!.scheduleType).toBe("single_round_robin");
  });
});

describe("clearSchedule", () => {
  it("removes all scheduled matchups", async () => {
    const { league } = await setupLeagueWithTeams(4);
    await generateSchedule(league.slug, {
      type: "single_round_robin",
      totalWeeks: 10,
    });

    const result = await clearSchedule(league.slug);
    expect(result.success).toBe(true);

    const matchups = await testPrisma.scheduledMatchup.findMany({
      where: { leagueId: league.id },
    });
    expect(matchups.length).toBe(0);

    const updated = await testPrisma.league.findUnique({ where: { id: league.id } });
    expect(updated!.scheduleType).toBeNull();
  });
});

describe("getSchedule", () => {
  it("returns schedule organized by week", async () => {
    const { league } = await setupLeagueWithTeams(4);
    await generateSchedule(league.slug, {
      type: "single_round_robin",
      totalWeeks: 10,
    });

    const schedule = await getSchedule(league.id);
    expect(schedule.length).toBe(3); // 3 weeks
    expect(schedule[0].weekNumber).toBe(1);
    expect(schedule[0].matches.length).toBe(2); // 2 matches per week with 4 teams
    expect(schedule[0].matches[0].teamA).toBeDefined();
    expect(schedule[0].matches[0].teamB).toBeDefined();
  });

  it("returns empty array for league with no schedule", async () => {
    const league = unwrap(await createLeague("No Schedule League", "securepass123"));
    const schedule = await getSchedule(league.id);
    expect(schedule).toEqual([]);
  });
});

describe("getScheduleForWeek", () => {
  it("returns matches for a specific week", async () => {
    const { league } = await setupLeagueWithTeams(4);
    await generateSchedule(league.slug, {
      type: "single_round_robin",
      totalWeeks: 10,
    });

    const matches = await getScheduleForWeek(league.id, 1);
    expect(matches.length).toBe(2);
    expect(matches[0].status).toBe("scheduled");
  });

  it("returns empty array for non-existent week", async () => {
    const { league } = await setupLeagueWithTeams(4);
    const matches = await getScheduleForWeek(league.id, 99);
    expect(matches).toEqual([]);
  });
});

describe("getTeamSchedule", () => {
  it("returns schedule filtered for a specific team", async () => {
    const { league, teamIds } = await setupLeagueWithTeams(4);
    await generateSchedule(league.slug, {
      type: "single_round_robin",
      totalWeeks: 10,
    });

    const teamSchedule = await getTeamSchedule(league.id, teamIds[0]);
    // Each team plays 3 matches in single round-robin with 4 teams
    expect(teamSchedule.length).toBe(3);
  });
});

describe("getScheduleStatus", () => {
  it("returns correct status for generated schedule", async () => {
    const { league } = await setupLeagueWithTeams(4);
    await generateSchedule(league.slug, {
      type: "single_round_robin",
      totalWeeks: 10,
    });

    const status = await getScheduleStatus(league.id);
    expect(status.hasSchedule).toBe(true);
    expect(status.scheduleType).toBe("single_round_robin");
    expect(status.totalWeeks).toBe(3);
    expect(status.completedWeeks).toBe(0);
    expect(status.remainingWeeks).toBe(3);
    expect(status.teamCount).toBe(4);
  });

  it("returns no-schedule status for empty league", async () => {
    const league = unwrap(await createLeague("Empty League", "securepass123"));
    const status = await getScheduleStatus(league.id);
    expect(status.hasSchedule).toBe(false);
    expect(status.totalWeeks).toBe(0);
    expect(status.teamCount).toBe(0);
  });
});

// ==========================================
// swapTeamsInMatchup
// ==========================================

describe("swapTeamsInMatchup", () => {
  it("swaps teams successfully in a scheduled matchup", async () => {
    const { league, teamIds } = await setupLeagueWithTeams(4);
    await generateSchedule(league.slug, {
      type: "single_round_robin",
      totalWeeks: 10,
    });

    // Get a scheduled matchup
    const matchups = await testPrisma.scheduledMatchup.findMany({
      where: { leagueId: league.id, status: "scheduled" },
    });
    expect(matchups.length).toBeGreaterThan(0);

    const target = matchups[0];
    // Swap teamA and teamB
    const result = await swapTeamsInMatchup(
      league.slug,
      target.id,
      target.teamBId!,
      target.teamAId
    );
    expect(result.success).toBe(true);

    // Verify in DB
    const updated = await testPrisma.scheduledMatchup.findUnique({
      where: { id: target.id },
    });
    expect(updated!.teamAId).toBe(target.teamBId);
    expect(updated!.teamBId).toBe(target.teamAId);
  });

  it("returns error when matchup not found", async () => {
    const { league } = await setupLeagueWithTeams(4);
    await generateSchedule(league.slug, {
      type: "single_round_robin",
      totalWeeks: 10,
    });

    // Get valid teamIds for the league
    const teams = await testPrisma.team.findMany({
      where: { leagueId: league.id },
    });

    const result = await swapTeamsInMatchup(
      league.slug,
      999999,
      teams[0].id,
      teams[1].id
    );
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("not found");
  });

  it("returns error when team does not belong to league", async () => {
    const { league } = await setupLeagueWithTeams(4);
    await generateSchedule(league.slug, {
      type: "single_round_robin",
      totalWeeks: 10,
    });

    const matchups = await testPrisma.scheduledMatchup.findMany({
      where: { leagueId: league.id, status: "scheduled" },
    });
    const target = matchups[0];

    // Use a fake team ID that doesn't belong to the league
    const result = await swapTeamsInMatchup(
      league.slug,
      target.id,
      999999,
      target.teamBId
    );
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("do not belong");
  });

  it("returns error when matchup is not in scheduled status", async () => {
    const { league, teamIds } = await setupLeagueWithTeams(4);
    await generateSchedule(league.slug, {
      type: "single_round_robin",
      totalWeeks: 10,
    });

    // Mark a matchup as completed
    const matchups = await testPrisma.scheduledMatchup.findMany({
      where: { leagueId: league.id, status: "scheduled" },
    });
    const target = matchups[0];
    await testPrisma.scheduledMatchup.update({
      where: { id: target.id },
      data: { status: "completed" },
    });

    const result = await swapTeamsInMatchup(
      league.slug,
      target.id,
      target.teamAId,
      target.teamBId
    );
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("only modify scheduled");
  });
});

// ==========================================
// cancelScheduledMatchup
// ==========================================

describe("cancelScheduledMatchup", () => {
  it("cancels a scheduled matchup", async () => {
    const { league } = await setupLeagueWithTeams(4);
    await generateSchedule(league.slug, {
      type: "single_round_robin",
      totalWeeks: 10,
    });

    const matchups = await testPrisma.scheduledMatchup.findMany({
      where: { leagueId: league.id, status: "scheduled" },
    });
    const target = matchups[0];

    const result = await cancelScheduledMatchup(league.slug, target.id);
    expect(result.success).toBe(true);

    // Verify in DB
    const updated = await testPrisma.scheduledMatchup.findUnique({
      where: { id: target.id },
    });
    expect(updated!.status).toBe("cancelled");
  });

  it("returns error when matchup not found", async () => {
    const { league } = await setupLeagueWithTeams(4);

    const result = await cancelScheduledMatchup(league.slug, 999999);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("not found");
  });

  it("returns error when matchup is already completed", async () => {
    const { league } = await setupLeagueWithTeams(4);
    await generateSchedule(league.slug, {
      type: "single_round_robin",
      totalWeeks: 10,
    });

    const matchups = await testPrisma.scheduledMatchup.findMany({
      where: { leagueId: league.id, status: "scheduled" },
    });
    const target = matchups[0];
    await testPrisma.scheduledMatchup.update({
      where: { id: target.id },
      data: { status: "completed" },
    });

    const result = await cancelScheduledMatchup(league.slug, target.id);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("only cancel scheduled");
  });

  it("returns error when matchup is already cancelled", async () => {
    const { league } = await setupLeagueWithTeams(4);
    await generateSchedule(league.slug, {
      type: "single_round_robin",
      totalWeeks: 10,
    });

    const matchups = await testPrisma.scheduledMatchup.findMany({
      where: { leagueId: league.id, status: "scheduled" },
    });
    const target = matchups[0];
    await testPrisma.scheduledMatchup.update({
      where: { id: target.id },
      data: { status: "cancelled" },
    });

    const result = await cancelScheduledMatchup(league.slug, target.id);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("only cancel scheduled");
  });
});

// ==========================================
// rescheduleMatchup
// ==========================================

describe("rescheduleMatchup", () => {
  it("reschedules a matchup to an empty week", async () => {
    const { league } = await setupLeagueWithTeams(4);
    await generateSchedule(league.slug, {
      type: "single_round_robin",
      totalWeeks: 10,
    });

    // Get a matchup from week 1
    const week1Matchups = await testPrisma.scheduledMatchup.findMany({
      where: { leagueId: league.id, weekNumber: 1, status: "scheduled" },
    });
    const target = week1Matchups[0];

    // Reschedule to a week that doesn't exist (week 10)
    const result = await rescheduleMatchup(league.slug, target.id, 10);
    expect(result.success).toBe(true);

    // Verify in DB
    const updated = await testPrisma.scheduledMatchup.findUnique({
      where: { id: target.id },
    });
    expect(updated!.weekNumber).toBe(10);
  });

  it("returns error when team already has a matchup in the target week", async () => {
    const { league } = await setupLeagueWithTeams(4);
    await generateSchedule(league.slug, {
      type: "single_round_robin",
      totalWeeks: 10,
    });

    // Get matchups from week 1 and week 2
    const week1Matchups = await testPrisma.scheduledMatchup.findMany({
      where: { leagueId: league.id, weekNumber: 1, status: "scheduled" },
    });
    const target = week1Matchups[0];

    // Try to reschedule week 1 matchup to week 2 where teams are already playing
    const result = await rescheduleMatchup(league.slug, target.id, 2);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("already have a matchup");
  });

  it("returns error when matchup not found", async () => {
    const { league } = await setupLeagueWithTeams(4);

    const result = await rescheduleMatchup(league.slug, 999999, 5);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("not found");
  });

  it("returns error when matchup is not in scheduled status", async () => {
    const { league } = await setupLeagueWithTeams(4);
    await generateSchedule(league.slug, {
      type: "single_round_robin",
      totalWeeks: 10,
    });

    const matchups = await testPrisma.scheduledMatchup.findMany({
      where: { leagueId: league.id, status: "scheduled" },
    });
    const target = matchups[0];
    await testPrisma.scheduledMatchup.update({
      where: { id: target.id },
      data: { status: "completed" },
    });

    const result = await rescheduleMatchup(league.slug, target.id, 10);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("only reschedule unplayed");
  });
});

// ==========================================
// addManualScheduledMatchup
// ==========================================

describe("addManualScheduledMatchup", () => {
  it("adds a matchup to a week successfully", async () => {
    const { league, teamIds } = await setupLeagueWithTeams(4);

    // Add a manual matchup to week 1 (no schedule generated yet)
    const result = await addManualScheduledMatchup(
      league.slug,
      1,
      teamIds[0],
      teamIds[1]
    );
    expect(result.success).toBe(true);

    // Verify in DB
    const matchups = await testPrisma.scheduledMatchup.findMany({
      where: { leagueId: league.id, weekNumber: 1 },
    });
    expect(matchups.length).toBe(1);
    expect(matchups[0].teamAId).toBe(teamIds[0]);
    expect(matchups[0].teamBId).toBe(teamIds[1]);
    expect(matchups[0].status).toBe("scheduled");
  });

  it("adds a bye matchup (null teamB) successfully", async () => {
    const { league, teamIds } = await setupLeagueWithTeams(4);

    const result = await addManualScheduledMatchup(
      league.slug,
      1,
      teamIds[0],
      null
    );
    expect(result.success).toBe(true);

    const matchups = await testPrisma.scheduledMatchup.findMany({
      where: { leagueId: league.id, weekNumber: 1 },
    });
    expect(matchups.length).toBe(1);
    expect(matchups[0].teamAId).toBe(teamIds[0]);
    expect(matchups[0].teamBId).toBeNull();
  });

  it("returns error when team already has a matchup that week", async () => {
    const { league, teamIds } = await setupLeagueWithTeams(4);

    // Add first matchup
    unwrap(await addManualScheduledMatchup(league.slug, 1, teamIds[0], teamIds[1]));

    // Try to add another matchup with teamIds[0] in the same week
    const result = await addManualScheduledMatchup(
      league.slug,
      1,
      teamIds[0],
      teamIds[2]
    );
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("already has a matchup");
  });

  it("returns error when teamB already has a matchup that week", async () => {
    const { league, teamIds } = await setupLeagueWithTeams(4);

    // Add first matchup
    unwrap(await addManualScheduledMatchup(league.slug, 1, teamIds[0], teamIds[1]));

    // Try to add another matchup with teamIds[1] as teamB
    const result = await addManualScheduledMatchup(
      league.slug,
      1,
      teamIds[2],
      teamIds[1]
    );
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("already has a matchup");
  });

  it("returns error when team does not belong to league", async () => {
    const { league } = await setupLeagueWithTeams(4);

    const result = await addManualScheduledMatchup(
      league.slug,
      1,
      999999,
      null
    );
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("do not belong");
  });
});

// ==========================================
// processByeWeekPoints
// ==========================================

describe("processByeWeekPoints", () => {
  it("awards zero points in 'zero' mode", async () => {
    // Use 3 teams to get bye matchups
    const { league, teamIds } = await setupLeagueWithTeams(3);
    await generateSchedule(league.slug, {
      type: "single_round_robin",
      totalWeeks: 10,
    });

    // Set byePointsMode to "zero"
    await testPrisma.league.update({
      where: { id: league.id },
      data: { byePointsMode: "zero", byePointsFlat: 0 },
    });

    // Find a bye matchup (teamBId is null)
    const byeMatchup = await testPrisma.scheduledMatchup.findFirst({
      where: { leagueId: league.id, teamBId: null, status: "scheduled" },
    });
    expect(byeMatchup).not.toBeNull();

    // Record team's points before
    const teamBefore = await testPrisma.team.findUnique({
      where: { id: byeMatchup!.teamAId },
    });

    const result = await processByeWeekPoints(league.slug, byeMatchup!.weekNumber);
    expect(result.success).toBe(true);

    // Verify: team points should NOT increase
    const teamAfter = await testPrisma.team.findUnique({
      where: { id: byeMatchup!.teamAId },
    });
    expect(teamAfter!.totalPoints).toBe(teamBefore!.totalPoints);

    // Verify: bye matchup should be marked as completed
    const updatedBye = await testPrisma.scheduledMatchup.findUnique({
      where: { id: byeMatchup!.id },
    });
    expect(updatedBye!.status).toBe("completed");
  });

  it("awards flat points in 'flat' mode", async () => {
    const { league, teamIds } = await setupLeagueWithTeams(3);
    await generateSchedule(league.slug, {
      type: "single_round_robin",
      totalWeeks: 10,
    });

    const flatAmount = 15;
    await testPrisma.league.update({
      where: { id: league.id },
      data: { byePointsMode: "flat", byePointsFlat: flatAmount },
    });

    const byeMatchup = await testPrisma.scheduledMatchup.findFirst({
      where: { leagueId: league.id, teamBId: null, status: "scheduled" },
    });
    expect(byeMatchup).not.toBeNull();

    const teamBefore = await testPrisma.team.findUnique({
      where: { id: byeMatchup!.teamAId },
    });

    const result = await processByeWeekPoints(league.slug, byeMatchup!.weekNumber);
    expect(result.success).toBe(true);

    // Verify: team points should increase by flat amount
    const teamAfter = await testPrisma.team.findUnique({
      where: { id: byeMatchup!.teamAId },
    });
    expect(teamAfter!.totalPoints).toBe(teamBefore!.totalPoints + flatAmount);

    // Verify: bye matchup should be marked as completed
    const updatedBye = await testPrisma.scheduledMatchup.findUnique({
      where: { id: byeMatchup!.id },
    });
    expect(updatedBye!.status).toBe("completed");
  });

  it("returns success with no changes when no bye entries exist", async () => {
    // Use 4 teams (even number = no byes)
    const { league } = await setupLeagueWithTeams(4);
    await generateSchedule(league.slug, {
      type: "single_round_robin",
      totalWeeks: 10,
    });

    // Verify no bye matchups exist
    const byeMatchups = await testPrisma.scheduledMatchup.findMany({
      where: { leagueId: league.id, teamBId: null },
    });
    expect(byeMatchups.length).toBe(0);

    const result = await processByeWeekPoints(league.slug, 1);
    expect(result.success).toBe(true);
  });

  it("does not re-process already completed bye matchups", async () => {
    const { league } = await setupLeagueWithTeams(3);
    await generateSchedule(league.slug, {
      type: "single_round_robin",
      totalWeeks: 10,
    });

    const flatAmount = 10;
    await testPrisma.league.update({
      where: { id: league.id },
      data: { byePointsMode: "flat", byePointsFlat: flatAmount },
    });

    const byeMatchup = await testPrisma.scheduledMatchup.findFirst({
      where: { leagueId: league.id, teamBId: null, status: "scheduled" },
    });
    expect(byeMatchup).not.toBeNull();

    // Process bye points once
    unwrap(await processByeWeekPoints(league.slug, byeMatchup!.weekNumber));

    const teamAfterFirst = await testPrisma.team.findUnique({
      where: { id: byeMatchup!.teamAId },
    });

    // Process again - should not double-award since bye is now "completed"
    const result = await processByeWeekPoints(league.slug, byeMatchup!.weekNumber);
    expect(result.success).toBe(true);

    const teamAfterSecond = await testPrisma.team.findUnique({
      where: { id: byeMatchup!.teamAId },
    });
    expect(teamAfterSecond!.totalPoints).toBe(teamAfterFirst!.totalPoints);
  });
});

// ==========================================
// addTeamToSchedule
// ==========================================

describe("addTeamToSchedule", () => {
  it("fills bye slots with fill_byes strategy", async () => {
    // 3 teams => odd number => bye matchups exist
    const { league, teamIds } = await setupLeagueWithTeams(3);
    await generateSchedule(league.slug, {
      type: "single_round_robin",
      totalWeeks: 10,
    });

    // Count bye matchups before
    const byesBefore = await testPrisma.scheduledMatchup.findMany({
      where: { leagueId: league.id, teamBId: null, status: "scheduled" },
    });
    expect(byesBefore.length).toBeGreaterThan(0);

    // Create a new team to add
    const newTeam = unwrap(await createTeam(league.id, "Team D"));
    await approveTeam(league.slug, newTeam.id);

    const result = await addTeamToSchedule(league.slug, newTeam.id, "fill_byes");
    expect(result.success).toBe(true);

    // Verify: bye slots should now have the new team as teamB
    const byesAfter = await testPrisma.scheduledMatchup.findMany({
      where: { leagueId: league.id, teamBId: null, status: "scheduled" },
    });
    expect(byesAfter.length).toBe(0);

    // Verify: the new team should appear in the schedule
    const newTeamMatchups = await testPrisma.scheduledMatchup.findMany({
      where: {
        leagueId: league.id,
        OR: [{ teamAId: newTeam.id }, { teamBId: newTeam.id }],
      },
    });
    expect(newTeamMatchups.length).toBe(byesBefore.length);
  });

  it("regenerates future schedule with start_from_here strategy", async () => {
    const { league, teamIds } = await setupLeagueWithTeams(4);
    await generateSchedule(league.slug, {
      type: "single_round_robin",
      totalWeeks: 10,
    });

    // Create and approve a new team
    const newTeam = unwrap(await createTeam(league.id, "Team E"));
    await approveTeam(league.slug, newTeam.id);

    const result = await addTeamToSchedule(league.slug, newTeam.id, "start_from_here");
    expect(result.success).toBe(true);

    // Verify: the new team should appear in the schedule
    const newTeamMatchups = await testPrisma.scheduledMatchup.findMany({
      where: {
        leagueId: league.id,
        OR: [{ teamAId: newTeam.id }, { teamBId: newTeam.id }],
      },
    });
    expect(newTeamMatchups.length).toBeGreaterThan(0);

    // Verify: all 5 teams should appear in the regenerated schedule
    const allMatchups = await testPrisma.scheduledMatchup.findMany({
      where: { leagueId: league.id },
    });
    const teamIdsInSchedule = new Set<number>();
    for (const m of allMatchups) {
      teamIdsInSchedule.add(m.teamAId);
      if (m.teamBId) teamIdsInSchedule.add(m.teamBId);
    }
    expect(teamIdsInSchedule.has(newTeam.id)).toBe(true);
  });

  it("returns error when no bye slots available for fill_byes with even teams", async () => {
    // 4 teams => even number => no byes
    const { league, teamIds } = await setupLeagueWithTeams(4);
    await generateSchedule(league.slug, {
      type: "single_round_robin",
      totalWeeks: 10,
    });

    const newTeam = unwrap(await createTeam(league.id, "Team E"));
    await approveTeam(league.slug, newTeam.id);

    const result = await addTeamToSchedule(league.slug, newTeam.id, "fill_byes");
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("No bye slots");
  });

  it("returns error when no remaining weeks in schedule", async () => {
    const { league, teamIds } = await setupLeagueWithTeams(4);
    await generateSchedule(league.slug, {
      type: "single_round_robin",
      totalWeeks: 10,
    });

    // Mark all scheduled matchups as completed by creating real Matchup records
    // and changing status. We'll simulate this by setting all weeks as completed
    // via a real matchup on the last week.
    const allMatchups = await testPrisma.scheduledMatchup.findMany({
      where: { leagueId: league.id },
      orderBy: { weekNumber: "desc" },
    });
    const maxWeek = allMatchups[0].weekNumber;

    // Create a completed matchup in the last week to push currentWeek beyond maxWeek
    await testPrisma.matchup.create({
      data: {
        leagueId: league.id,
        weekNumber: maxWeek,
        teamAId: teamIds[0],
        teamBId: teamIds[1],
        teamAGross: 80,
        teamAHandicap: 10,
        teamANet: 70,
        teamAPoints: 5,
        teamBGross: 85,
        teamBHandicap: 12,
        teamBNet: 73,
        teamBPoints: 3,
      },
    });

    const newTeam = unwrap(await createTeam(league.id, "Team E"));
    await approveTeam(league.slug, newTeam.id);

    const result = await addTeamToSchedule(league.slug, newTeam.id, "start_from_here");
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("No remaining weeks");
  });
});

// ==========================================
// removeTeamFromSchedule
// ==========================================

describe("removeTeamFromSchedule", () => {
  it("converts matchups to byes with bye_opponents action", async () => {
    const { league, teamIds } = await setupLeagueWithTeams(4);
    await generateSchedule(league.slug, {
      type: "single_round_robin",
      totalWeeks: 10,
    });

    const teamToRemove = teamIds[0];

    // Count matchups involving this team before removal
    const teamMatchupsBefore = await testPrisma.scheduledMatchup.findMany({
      where: {
        leagueId: league.id,
        status: "scheduled",
        OR: [{ teamAId: teamToRemove }, { teamBId: teamToRemove }],
      },
    });
    expect(teamMatchupsBefore.length).toBeGreaterThan(0);

    const result = await removeTeamFromSchedule(league.slug, teamToRemove, "bye_opponents");
    expect(result.success).toBe(true);

    // Verify: removed team should no longer appear in any active matchups
    // (their old matchups should either have the opponent as teamA with bye, or be cancelled)
    const activeMatchupsWithTeam = await testPrisma.scheduledMatchup.findMany({
      where: {
        leagueId: league.id,
        status: "scheduled",
        OR: [{ teamAId: teamToRemove }, { teamBId: teamToRemove }],
      },
    });
    expect(activeMatchupsWithTeam.length).toBe(0);

    // Verify: opponents from those matchups should now have bye entries
    const byeEntries = await testPrisma.scheduledMatchup.findMany({
      where: {
        leagueId: league.id,
        teamBId: null,
        status: { not: "cancelled" },
      },
    });
    expect(byeEntries.length).toBeGreaterThan(0);
  });

  it("converts teamA removal correctly (opponent becomes teamA)", async () => {
    const { league, teamIds } = await setupLeagueWithTeams(4);
    await generateSchedule(league.slug, {
      type: "single_round_robin",
      totalWeeks: 10,
    });

    const teamToRemove = teamIds[0];

    // Find matchups where teamToRemove is teamA and teamB exists
    const matchupsAsTeamA = await testPrisma.scheduledMatchup.findMany({
      where: {
        leagueId: league.id,
        teamAId: teamToRemove,
        teamBId: { not: null },
        status: "scheduled",
      },
    });

    const result = await removeTeamFromSchedule(league.slug, teamToRemove, "bye_opponents");
    expect(result.success).toBe(true);

    // Verify: for matchups where removed team was teamA,
    // the opponent (original teamB) should now be teamA with teamB = null
    for (const m of matchupsAsTeamA) {
      const updated = await testPrisma.scheduledMatchup.findUnique({
        where: { id: m.id },
      });
      expect(updated!.teamAId).toBe(m.teamBId);
      expect(updated!.teamBId).toBeNull();
    }
  });

  it("converts teamB removal correctly (teamB becomes null)", async () => {
    const { league, teamIds } = await setupLeagueWithTeams(4);
    await generateSchedule(league.slug, {
      type: "single_round_robin",
      totalWeeks: 10,
    });

    const teamToRemove = teamIds[0];

    // Find matchups where teamToRemove is teamB
    const matchupsAsTeamB = await testPrisma.scheduledMatchup.findMany({
      where: {
        leagueId: league.id,
        teamBId: teamToRemove,
        status: "scheduled",
      },
    });

    const result = await removeTeamFromSchedule(league.slug, teamToRemove, "bye_opponents");
    expect(result.success).toBe(true);

    // Verify: for matchups where removed team was teamB,
    // teamA stays the same and teamB becomes null
    for (const m of matchupsAsTeamB) {
      const updated = await testPrisma.scheduledMatchup.findUnique({
        where: { id: m.id },
      });
      expect(updated!.teamAId).toBe(m.teamAId);
      expect(updated!.teamBId).toBeNull();
    }
  });

  it("regenerates schedule without the removed team", async () => {
    const { league, teamIds } = await setupLeagueWithTeams(4);
    await generateSchedule(league.slug, {
      type: "single_round_robin",
      totalWeeks: 10,
    });

    const teamToRemove = teamIds[0];

    const result = await removeTeamFromSchedule(league.slug, teamToRemove, "regenerate");
    expect(result.success).toBe(true);

    // Verify: removed team should not appear in any scheduled matchups
    const matchupsWithRemoved = await testPrisma.scheduledMatchup.findMany({
      where: {
        leagueId: league.id,
        status: "scheduled",
        OR: [{ teamAId: teamToRemove }, { teamBId: teamToRemove }],
      },
    });
    expect(matchupsWithRemoved.length).toBe(0);

    // Verify: remaining 3 teams should still have matchups
    const remainingMatchups = await testPrisma.scheduledMatchup.findMany({
      where: { leagueId: league.id, status: "scheduled" },
    });
    expect(remainingMatchups.length).toBeGreaterThan(0);

    // Verify: only the remaining 3 teams appear
    const teamIdsInSchedule = new Set<number>();
    for (const m of remainingMatchups) {
      teamIdsInSchedule.add(m.teamAId);
      if (m.teamBId) teamIdsInSchedule.add(m.teamBId);
    }
    expect(teamIdsInSchedule.has(teamToRemove)).toBe(false);
    // The remaining 3 teams should all appear
    for (const tid of teamIds.filter((id) => id !== teamToRemove)) {
      expect(teamIdsInSchedule.has(tid)).toBe(true);
    }
  });

  it("does not modify completed matchups when removing a team", async () => {
    const { league, teamIds } = await setupLeagueWithTeams(4);
    await generateSchedule(league.slug, {
      type: "single_round_robin",
      totalWeeks: 10,
    });

    const teamToRemove = teamIds[0];

    // Mark a matchup involving the team as "completed" (simulating a played match)
    const matchup = await testPrisma.scheduledMatchup.findFirst({
      where: {
        leagueId: league.id,
        status: "scheduled",
        OR: [{ teamAId: teamToRemove }, { teamBId: teamToRemove }],
      },
    });
    expect(matchup).not.toBeNull();
    await testPrisma.scheduledMatchup.update({
      where: { id: matchup!.id },
      data: { status: "completed" },
    });

    const result = await removeTeamFromSchedule(league.slug, teamToRemove, "bye_opponents");
    expect(result.success).toBe(true);

    // Verify: the completed matchup should remain unchanged
    const completedMatchup = await testPrisma.scheduledMatchup.findUnique({
      where: { id: matchup!.id },
    });
    expect(completedMatchup!.status).toBe("completed");
    expect(completedMatchup!.teamAId).toBe(matchup!.teamAId);
    expect(completedMatchup!.teamBId).toBe(matchup!.teamBId);
  });

  it("handles regenerate when removing leaves exactly 2 teams", async () => {
    const { league, teamIds } = await setupLeagueWithTeams(3);
    await generateSchedule(league.slug, {
      type: "single_round_robin",
      totalWeeks: 10,
    });

    const teamToRemove = teamIds[0];

    const result = await removeTeamFromSchedule(league.slug, teamToRemove, "regenerate");
    expect(result.success).toBe(true);

    // Verify: remaining 2 teams should still have matchups
    const remainingMatchups = await testPrisma.scheduledMatchup.findMany({
      where: { leagueId: league.id, status: "scheduled" },
    });
    expect(remainingMatchups.length).toBeGreaterThan(0);

    // Verify: only 2 remaining teams appear
    const teamIdsInSchedule = new Set<number>();
    for (const m of remainingMatchups) {
      teamIdsInSchedule.add(m.teamAId);
      if (m.teamBId) teamIdsInSchedule.add(m.teamBId);
    }
    expect(teamIdsInSchedule.has(teamToRemove)).toBe(false);
    expect(teamIdsInSchedule.size).toBe(2);
  });
});
