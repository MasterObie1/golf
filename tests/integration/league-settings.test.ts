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
import { requireLeagueAdmin } from "@/lib/auth";

const mockedRequireLeagueAdmin = vi.mocked(requireLeagueAdmin);

// ==========================================
// Helpers
// ==========================================

function setAuthContext(leagueId: number, leagueSlug: string, adminUsername: string) {
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
