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
  getScoringConfig,
  updateScoringConfig,
  getScheduleConfig,
  updateScheduleConfig,
  type ScoringConfigInput,
  type ScheduleConfigInput,
} from "@/lib/actions/scoring-config";
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

const DEFAULT_SCORING_INPUT: ScoringConfigInput = {
  scoringType: "match_play",
  strokePlayPointPreset: "linear",
  strokePlayPointScale: null,
  strokePlayBonusShow: 0,
  strokePlayBonusBeat: 0,
  strokePlayDnpPoints: 0,
  strokePlayTieMode: "split",
  strokePlayDnpPenalty: 0,
  strokePlayMaxDnp: null,
  strokePlayProRate: false,
  hybridFieldWeight: 0.5,
  hybridFieldPointScale: null,
};

const DEFAULT_SCHEDULE_INPUT: ScheduleConfigInput = {
  scheduleVisibility: "full",
  byePointsMode: "zero",
  byePointsFlat: 0,
  scheduleExtraWeeks: "flex",
  midSeasonAddDefault: "start_from_here",
  midSeasonRemoveAction: "bye_opponents",
  playoffWeeks: 0,
  playoffTeams: 4,
  playoffFormat: "single_elimination",
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

describe("getScoringConfig", () => {
  it("returns default scoring config for new league", async () => {
    const league = unwrap(await createLeague("Scoring Config League", "securepass123"));
    setAuthContext(league.id, league.slug, league.adminUsername);

    const config = await getScoringConfig(league.slug);
    expect(config.scoringType).toBe("match_play");
    expect(config.strokePlayPointPreset).toBe("linear");
    expect(config.strokePlayPointScale).toBeNull();
    expect(config.strokePlayBonusShow).toBe(0);
    expect(config.strokePlayBonusBeat).toBe(0);
    expect(config.strokePlayTieMode).toBe("split");
  });
});

describe("updateScoringConfig", () => {
  let leagueSlug: string;
  let leagueId: number;

  beforeEach(async () => {
    const league = unwrap(await createLeague("Update Scoring League", "securepass123"));
    leagueSlug = league.slug;
    leagueId = league.id;
    setAuthContext(league.id, league.slug, league.adminUsername);
  });

  it("updates scoring type to stroke_play", async () => {
    const result = await updateScoringConfig(leagueSlug, {
      ...DEFAULT_SCORING_INPUT,
      scoringType: "stroke_play",
      strokePlayPointPreset: "weighted",
      strokePlayPointScale: [15, 12, 10, 8, 6, 5, 4, 3, 2, 1],
    });
    expect(result.success).toBe(true);

    const config = await getScoringConfig(leagueSlug);
    expect(config.scoringType).toBe("stroke_play");
    expect(config.strokePlayPointPreset).toBe("weighted");
    expect(config.strokePlayPointScale).toEqual([15, 12, 10, 8, 6, 5, 4, 3, 2, 1]);
  });

  it("updates to hybrid with field weight", async () => {
    const result = await updateScoringConfig(leagueSlug, {
      ...DEFAULT_SCORING_INPUT,
      scoringType: "hybrid",
      hybridFieldWeight: 0.7,
      hybridFieldPointScale: [10, 8, 6, 4, 2],
    });
    expect(result.success).toBe(true);

    const config = await getScoringConfig(leagueSlug);
    expect(config.scoringType).toBe("hybrid");
    expect(config.hybridFieldWeight).toBe(0.7);
    expect(config.hybridFieldPointScale).toEqual([10, 8, 6, 4, 2]);
  });

  it("rejects non-descending point scale", async () => {
    const result = await updateScoringConfig(leagueSlug, {
      ...DEFAULT_SCORING_INPUT,
      strokePlayPointScale: [1, 2, 3], // ascending — invalid
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("descending");
  });

  it("rejects invalid scoring type", async () => {
    const result = await updateScoringConfig(leagueSlug, {
      ...DEFAULT_SCORING_INPUT,
      scoringType: "invalid_type" as "match_play",
    });
    expect(result.success).toBe(false);
  });
});

describe("getScheduleConfig", () => {
  it("returns default schedule config for new league", async () => {
    const league = unwrap(await createLeague("Schedule Config League", "securepass123"));
    const config = await getScheduleConfig(league.id);
    expect(config.scheduleVisibility).toBe("full");
    expect(config.byePointsMode).toBe("flat");
    expect(config.playoffWeeks).toBe(0);
    expect(config.playoffFormat).toBe("single_elimination");
  });
});

describe("updateScheduleConfig", () => {
  let leagueSlug: string;
  let leagueId: number;

  beforeEach(async () => {
    const league = unwrap(await createLeague("Update Schedule League", "securepass123"));
    leagueSlug = league.slug;
    leagueId = league.id;
    setAuthContext(league.id, league.slug, league.adminUsername);
  });

  it("updates schedule config fields", async () => {
    const result = await updateScheduleConfig(leagueSlug, {
      ...DEFAULT_SCHEDULE_INPUT,
      scheduleVisibility: "current_week",
      byePointsMode: "flat",
      byePointsFlat: 10,
      playoffWeeks: 2,
      playoffTeams: 6,
      playoffFormat: "double_elimination",
    });
    expect(result.success).toBe(true);

    const config = await getScheduleConfig(leagueId);
    expect(config.scheduleVisibility).toBe("current_week");
    expect(config.byePointsMode).toBe("flat");
    expect(config.byePointsFlat).toBe(10);
    expect(config.playoffWeeks).toBe(2);
    expect(config.playoffTeams).toBe(6);
    expect(config.playoffFormat).toBe("double_elimination");
  });

  it("rejects invalid schedule visibility", async () => {
    const result = await updateScheduleConfig(leagueSlug, {
      ...DEFAULT_SCHEDULE_INPUT,
      scheduleVisibility: "invalid" as "full",
    });
    expect(result.success).toBe(false);
  });
});
