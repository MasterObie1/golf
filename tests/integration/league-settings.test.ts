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
  updateLeagueSettings,
  updateScorecardSettings,
  updateHandicapSettings,
  type HandicapSettingsInput,
} from "@/lib/actions/league-settings";
import { createLeague } from "@/lib/actions/leagues";
import { createSeason } from "@/lib/actions/seasons";
import { createTeam, approveTeam } from "@/lib/actions/teams";
import { submitWeeklyScores } from "@/lib/actions/weekly-scores";
import { submitMatchup } from "@/lib/actions/matchups";
import { requireAdmin, requireLeagueAdmin } from "@/lib/auth";

const mockedRequireAdmin = vi.mocked(requireAdmin);
const mockedRequireLeagueAdmin = vi.mocked(requireLeagueAdmin);

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

const DEFAULT_HANDICAP_INPUT: HandicapSettingsInput = {
  baseScore: 35,
  multiplier: 0.9,
  rounding: "floor",
  defaultHandicap: 0,
  maxHandicap: 9,
  minHandicap: null,
  scoreSelection: "all",
  scoreCount: null,
  bestOf: null,
  lastOf: null,
  dropHighest: 0,
  dropLowest: 0,
  useWeighting: false,
  weightRecent: 1,
  weightDecay: 0,
  capExceptional: false,
  exceptionalCap: null,
  provWeeks: 0,
  provMultiplier: 1,
  freezeWeek: null,
  useTrend: false,
  trendWeight: 0,
  requireApproval: false,
};

// ==========================================
// Lifecycle
// ==========================================

beforeAll(async () => { await cleanDatabase(); });
afterAll(async () => { await cleanDatabase(); await testPrisma.$disconnect(); });
beforeEach(async () => { await cleanDatabase(); });

// ==========================================
// Tests
// ==========================================

describe("updateLeagueSettings", () => {
  let leagueSlug: string;

  beforeEach(async () => {
    const league = unwrap(await createLeague("Settings Test League", "securepass123"));
    leagueSlug = league.slug;
    setAuthContext(league.id, league.slug, league.adminUsername);
  });

  it("updates maxTeams and registrationOpen", async () => {
    const result = await updateLeagueSettings(leagueSlug, 32, false);
    const data = unwrap(result);

    expect(data.maxTeams).toBe(32);
    expect(data.registrationOpen).toBe(false);
  });

  it("rejects maxTeams below 1", async () => {
    const result = await updateLeagueSettings(leagueSlug, 0, true);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("at least 1");
  });

  it("rejects maxTeams above 256", async () => {
    const result = await updateLeagueSettings(leagueSlug, 999, true);
    expect(result.success).toBe(false);
  });
});

describe("updateScorecardSettings", () => {
  let leagueSlug: string;
  let leagueId: number;

  beforeEach(async () => {
    const league = unwrap(await createLeague("Scorecard Settings League", "securepass123"));
    leagueSlug = league.slug;
    leagueId = league.id;
    setAuthContext(league.id, league.slug, league.adminUsername);
  });

  it("updates scorecard mode to required", async () => {
    const result = await updateScorecardSettings(leagueSlug, "required", true);
    expect(result.success).toBe(true);

    const league = await testPrisma.league.findUnique({ where: { id: leagueId } });
    expect(league!.scorecardMode).toBe("required");
    expect(league!.scorecardRequireApproval).toBe(true);
  });

  it("updates scorecard mode to disabled", async () => {
    const result = await updateScorecardSettings(leagueSlug, "disabled", false);
    expect(result.success).toBe(true);

    const league = await testPrisma.league.findUnique({ where: { id: leagueId } });
    expect(league!.scorecardMode).toBe("disabled");
  });

  it("rejects invalid scorecard mode", async () => {
    const result = await updateScorecardSettings(leagueSlug, "invalid" as "disabled", false);
    expect(result.success).toBe(false);
  });
});

describe("updateHandicapSettings", () => {
  let leagueSlug: string;
  let leagueId: number;

  beforeEach(async () => {
    const league = unwrap(await createLeague("Handicap Settings League", "securepass123"));
    leagueSlug = league.slug;
    leagueId = league.id;
    setAuthContext(league.id, league.slug, league.adminUsername);
  });

  it("updates handicap settings", async () => {
    const result = await updateHandicapSettings(leagueSlug, {
      ...DEFAULT_HANDICAP_INPUT,
      baseScore: 40,
      multiplier: 0.8,
      maxHandicap: 15,
      rounding: "round",
    });
    expect(result.success).toBe(true);

    const league = await testPrisma.league.findUnique({ where: { id: leagueId } });
    expect(league!.handicapBaseScore).toBe(40);
    expect(league!.handicapMultiplier).toBe(0.8);
    expect(league!.handicapMax).toBe(15);
    expect(league!.handicapRounding).toBe("round");
  });

  it("rejects when max < min", async () => {
    const result = await updateHandicapSettings(leagueSlug, {
      ...DEFAULT_HANDICAP_INPUT,
      maxHandicap: 5,
      minHandicap: 10, // min > max
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("greater than or equal");
  });

  it("rejects best_of_last without bestOf/lastOf", async () => {
    const result = await updateHandicapSettings(leagueSlug, {
      ...DEFAULT_HANDICAP_INPUT,
      scoreSelection: "best_of_last",
      bestOf: null,
      lastOf: null,
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("required");
  });

  it("rejects last_n without scoreCount", async () => {
    const result = await updateHandicapSettings(leagueSlug, {
      ...DEFAULT_HANDICAP_INPUT,
      scoreSelection: "last_n",
      scoreCount: null,
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("required");
  });

  it("rejects bestOf > lastOf", async () => {
    const result = await updateHandicapSettings(leagueSlug, {
      ...DEFAULT_HANDICAP_INPUT,
      scoreSelection: "best_of_last",
      bestOf: 10,
      lastOf: 5,
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("less than or equal");
  });

  it("rejects combined drop count > 20", async () => {
    const result = await updateHandicapSettings(leagueSlug, {
      ...DEFAULT_HANDICAP_INPUT,
      dropHighest: 15,
      dropLowest: 10,
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("exceed 20");
  });
});

describe("recalculation rewrites weekly scores (stroke play)", () => {
  let leagueSlug: string;
  let leagueId: number;
  let teamAId: number;
  let teamBId: number;

  beforeEach(async () => {
    const league = unwrap(await createLeague("Recalc Weekly League", "securepass123", "stroke_play"));
    leagueSlug = league.slug;
    leagueId = league.id;
    setAuthContext(league.id, league.slug, league.adminUsername);

    unwrap(await createSeason(leagueSlug, "Season 1", 2025));
    const teamA = unwrap(await createTeam(leagueId, "Team Alpha"));
    const teamB = unwrap(await createTeam(leagueId, "Team Beta"));
    teamAId = teamA.id;
    teamBId = teamB.id;
    await approveTeam(leagueSlug, teamAId);
    await approveTeam(leagueSlug, teamBId);
  });

  it("recomputes WeeklyScore handicap/net/position/points and team totals on settings change", async () => {
    // Week 1 (manual/week-one handicaps are preserved by recalc).
    // Points and positions are deliberately wrong to prove the recalc fixes them.
    unwrap(await submitWeeklyScores(leagueSlug, 1, [
      { teamId: teamAId, grossScore: 42, handicap: 5, netScore: 37, points: 99, bonusPoints: 0, isSub: false, isDnp: false, position: 2 },
      { teamId: teamBId, grossScore: 45, handicap: 3, netScore: 42, points: 50, bonusPoints: 0, isSub: false, isDnp: false, position: 1 },
    ]));
    // Week 2 with stale handicaps
    unwrap(await submitWeeklyScores(leagueSlug, 2, [
      { teamId: teamAId, grossScore: 40, handicap: 6, netScore: 34, points: 10, bonusPoints: 0, isSub: false, isDnp: false, position: 1 },
      { teamId: teamBId, grossScore: 44, handicap: 5, netScore: 39, points: 8, bonusPoints: 0, isSub: false, isDnp: false, position: 2 },
    ]));

    // Change the multiplier — updateHandicapSettings triggers the recalculation
    unwrap(await updateHandicapSettings(leagueSlug, {
      ...DEFAULT_HANDICAP_INPUT,
      multiplier: 0.5,
    }));

    const scores = await testPrisma.weeklyScore.findMany({
      where: { leagueId },
      orderBy: [{ weekNumber: "asc" }, { teamId: "asc" }],
    });
    const byTeamWeek = (teamId: number, week: number) =>
      scores.find((s) => s.teamId === teamId && s.weekNumber === week)!;

    // Week 1: first-entry handicaps preserved, net recomputed, positions/points fixed.
    // A net 37 beats B net 42 -> A pos 1 (2 pts on linear scale for 2 teams), B pos 2 (1 pt)
    const a1 = byTeamWeek(teamAId, 1);
    expect(a1.handicap).toBe(5);
    expect(a1.netScore).toBe(37);
    expect(a1.position).toBe(1);
    expect(a1.points).toBe(2);
    const b1 = byTeamWeek(teamBId, 1);
    expect(b1.handicap).toBe(3);
    expect(b1.netScore).toBe(42);
    expect(b1.position).toBe(2);
    expect(b1.points).toBe(1);

    // Week 2: handicaps recomputed from week-1 gross with the new multiplier.
    // A: (42-35)*0.5 = 3.5 -> floor 3, net 40-3 = 37
    // B: (45-35)*0.5 = 5, net 44-5 = 39
    const a2 = byTeamWeek(teamAId, 2);
    expect(a2.handicap).toBe(3);
    expect(a2.netScore).toBe(37);
    expect(a2.position).toBe(1);
    expect(a2.points).toBe(2);
    const b2 = byTeamWeek(teamBId, 2);
    expect(b2.handicap).toBe(5);
    expect(b2.netScore).toBe(39);
    expect(b2.position).toBe(2);
    expect(b2.points).toBe(1);

    // Team totals rebuilt from the recomputed weekly points
    const teamA = await testPrisma.team.findUnique({ where: { id: teamAId } });
    const teamB = await testPrisma.team.findUnique({ where: { id: teamBId } });
    expect(teamA!.totalPoints).toBe(4);
    expect(teamB!.totalPoints).toBe(2);
  });
});

// ==========================================
// Preserve recorded handicaps (match play)
// ==========================================

describe("recalculation with preserveRecordedHandicaps", () => {
  async function setupWithTwoWeeks() {
    const league = unwrap(await createLeague("Preserve Hcp League", "securepass123"));
    setAuthContext(league.id, league.slug, league.adminUsername);
    unwrap(await createSeason(league.slug, "Season 1", 2026));
    const t1 = unwrap(await createTeam(league.id, "Team One"));
    const t2 = unwrap(await createTeam(league.id, "Team Two"));
    await approveTeam(league.slug, t1.id);
    await approveTeam(league.slug, t2.id);
    // Week 1: manual (first-entry) handicaps
    unwrap(await submitMatchup(league.slug, 1, t1.id, 40, 5, 35, 12, false, t2.id, 40, 2, 38, 8, false));
    // Week 2: official handicaps 0 and 9 — deliberately different from what the
    // engine would compute (floor(0.9×(40−35)) = 4 for both teams)
    unwrap(await submitMatchup(league.slug, 2, t1.id, 41, 0, 41, 9, false, t2.id, 39, 9, 30, 11, false));
    return { league, t1, t2 };
  }

  it("keeps stored matchup handicaps and nets when enabled", async () => {
    const { league } = await setupWithTwoWeeks();

    const result = await updateHandicapSettings(league.slug, {
      ...DEFAULT_HANDICAP_INPUT,
      multiplier: 1.2, // a change that would rewrite every handicap without preserve
      preserveRecordedHandicaps: true,
    });
    expect(result.success).toBe(true);

    const matchups = await testPrisma.matchup.findMany({
      where: { leagueId: league.id },
      orderBy: { weekNumber: "asc" },
    });
    expect(matchups[1].teamAHandicap).toBe(0);
    expect(matchups[1].teamBHandicap).toBe(9);
    expect(matchups[1].teamANet).toBe(41);
    expect(matchups[1].teamBNet).toBe(30);
  });

  it("recomputes non-first-week handicaps when disabled (default)", async () => {
    const { league } = await setupWithTwoWeeks();

    const result = await updateHandicapSettings(league.slug, {
      ...DEFAULT_HANDICAP_INPUT,
      preserveRecordedHandicaps: false,
    });
    expect(result.success).toBe(true);

    const matchups = await testPrisma.matchup.findMany({
      where: { leagueId: league.id },
      orderBy: { weekNumber: "asc" },
    });
    // Engine from week-1 gross 40: floor(0.9 × (40 − 35)) = 4
    expect(matchups[1].teamAHandicap).toBe(4);
    expect(matchups[1].teamBHandicap).toBe(4);
  });
});
