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
    login: { maxRequests: 100, windowSeconds: 60 },
    sudoLogin: { maxRequests: 100, windowSeconds: 60 },
    createLeague: { maxRequests: 100, windowSeconds: 60 },
    registerTeam: { maxRequests: 100, windowSeconds: 60 },
    scorecardSave: { maxRequests: 100, windowSeconds: 60 },
  },
}));

vi.mock("@/lib/scorecard-auth", () => ({
  createScorecardToken: vi.fn(async () => "mock-scorecard-token"),
  verifyScorecardToken: vi.fn(async () => null),
}));

vi.mock("@/lib/email", () => ({
  sendScorecardEmail: vi.fn(async () => ({ success: true })),
  isEmailConfigured: vi.fn(() => false),
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// ==========================================
// Imports
// ==========================================

import {
  getScorecardByToken,
  saveHoleScore,
  submitScorecard,
  generateScorecardLink,
  approveScorecard,
  rejectScorecard,
  getScorecardsForWeek,
  getScorecardDetail,
  adminSaveHoleScore,
  adminCompleteAndApproveScorecard,
  adminCreateScorecard,
  adminLinkScorecardToMatchup,
  getApprovedScorecardScores,
  getPublicScorecardForTeamWeek,
  getPublicScorecardsForWeek,
  getScorecardAvailabilityForSeason,
  checkEmailConfigured,
  emailScorecardLink,
} from "@/lib/actions/scorecards";
import { createLeague } from "@/lib/actions/leagues";
import { createTeam } from "@/lib/actions/teams";
import { createSeason } from "@/lib/actions/seasons";
import { createCourse } from "@/lib/actions/courses";
import { requireLeagueAdmin, requireAdmin } from "@/lib/auth";
import { verifyScorecardToken } from "@/lib/scorecard-auth";
import { isEmailConfigured } from "@/lib/email";

const mockedRequireLeagueAdmin = vi.mocked(requireLeagueAdmin);
const mockedRequireAdmin = vi.mocked(requireAdmin);
const mockedVerifyToken = vi.mocked(verifyScorecardToken);
const mockedIsEmailConfigured = vi.mocked(isEmailConfigured);

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

function make9Holes() {
  return Array.from({ length: 9 }, (_, i) => ({
    holeNumber: i + 1,
    par: i % 3 === 0 ? 5 : i % 3 === 1 ? 4 : 3,
    handicapIndex: i + 1,
    yardage: 100 + i * 30,
  }));
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

interface TestFixture {
  leagueId: number;
  leagueSlug: string;
  teamId: number;
  courseId: number;
  seasonId: number;
  holeIds: number[];
}

async function setupFixture(): Promise<TestFixture> {
  const league = unwrap(await createLeague(`Scorecard League ${Date.now()}`, "securepass123"));
  setAuthContext(league.id, league.slug, league.adminUsername);
  const season = unwrap(await createSeason(league.slug, "Season 1", 2025));
  const team = unwrap(await createTeam(league.id, "Team Alpha"));

  const course = unwrap(
    await createCourse(league.slug, {
      name: "Test Course",
      numberOfHoles: 9,
      holes: make9Holes(),
    })
  );

  const holes = await testPrisma.hole.findMany({
    where: { courseId: course.id },
    orderBy: { holeNumber: "asc" },
  });

  return {
    leagueId: league.id,
    leagueSlug: league.slug,
    teamId: team.id,
    courseId: course.id,
    seasonId: season.id,
    holeIds: holes.map((h) => h.id),
  };
}

async function createTestScorecard(
  fix: TestFixture,
  weekNumber: number = 1,
  status: string = "in_progress"
) {
  return testPrisma.scorecard.create({
    data: {
      leagueId: fix.leagueId,
      courseId: fix.courseId,
      teamId: fix.teamId,
      seasonId: fix.seasonId,
      weekNumber,
      status,
    },
  });
}

async function fillAllHoleScores(scorecardId: number, fix: TestFixture, strokes: number = 4) {
  for (let i = 0; i < fix.holeIds.length; i++) {
    await testPrisma.holeScore.create({
      data: {
        scorecardId,
        holeId: fix.holeIds[i],
        holeNumber: i + 1,
        strokes,
      },
    });
  }
}

// ==========================================
// Lifecycle
// ==========================================

beforeAll(async () => { await cleanDatabase(); });
afterAll(async () => { await cleanDatabase(); await testPrisma.$disconnect(); });
beforeEach(async () => {
  await cleanDatabase();
  mockedVerifyToken.mockReset();
});

// ==========================================
// Player-Facing: getScorecardByToken
// ==========================================

describe("getScorecardByToken", () => {
  it("returns error for invalid token", async () => {
    mockedVerifyToken.mockResolvedValue(null);
    const result = await getScorecardByToken("bad-token");
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("Invalid or expired");
  });

  it("returns scorecard detail for valid token", async () => {
    const fix = await setupFixture();
    const sc = await createTestScorecard(fix);

    mockedVerifyToken.mockResolvedValue({
      scorecardId: sc.id,
      teamId: fix.teamId,
      leagueId: fix.leagueId,
      weekNumber: 1,
    });

    const result = await getScorecardByToken("valid-token");
    const detail = unwrap(result);
    expect(detail.id).toBe(sc.id);
    expect(detail.teamName).toBe("Team Alpha");
    expect(detail.course.numberOfHoles).toBe(9);
    expect(detail.course.holes).toHaveLength(9);
    expect(detail.status).toBe("in_progress");
  });

  it("returns error when league ID mismatches", async () => {
    const fix = await setupFixture();
    const sc = await createTestScorecard(fix);

    mockedVerifyToken.mockResolvedValue({
      scorecardId: sc.id,
      teamId: fix.teamId,
      leagueId: 99999,
      weekNumber: 1,
    });

    const result = await getScorecardByToken("mismatched-token");
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("not found");
  });

  it("returns error for approved scorecard", async () => {
    const fix = await setupFixture();
    const sc = await createTestScorecard(fix, 1, "approved");

    mockedVerifyToken.mockResolvedValue({
      scorecardId: sc.id,
      teamId: fix.teamId,
      leagueId: fix.leagueId,
      weekNumber: 1,
    });

    const result = await getScorecardByToken("approved-token");
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("already been approved");
  });
});

// ==========================================
// Player-Facing: saveHoleScore
// ==========================================

describe("saveHoleScore", () => {
  it("returns error for invalid token", async () => {
    mockedVerifyToken.mockResolvedValue(null);
    const result = await saveHoleScore("bad-token", 1, 4);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("Invalid or expired");
  });

  it("saves a hole score successfully", async () => {
    const fix = await setupFixture();
    const sc = await createTestScorecard(fix);

    mockedVerifyToken.mockResolvedValue({
      scorecardId: sc.id,
      teamId: fix.teamId,
      leagueId: fix.leagueId,
      weekNumber: 1,
    });

    const result = await saveHoleScore("valid-token", 1, 4, 2, true, true);
    expect(result.success).toBe(true);

    const holeScore = await testPrisma.holeScore.findUnique({
      where: { scorecardId_holeNumber: { scorecardId: sc.id, holeNumber: 1 } },
    });
    expect(holeScore).not.toBeNull();
    expect(holeScore!.strokes).toBe(4);
    expect(holeScore!.putts).toBe(2);
    expect(holeScore!.fairwayHit).toBe(true);
    expect(holeScore!.greenInReg).toBe(true);
  });

  it("rejects strokes outside valid range", async () => {
    const fix = await setupFixture();
    const sc = await createTestScorecard(fix);

    mockedVerifyToken.mockResolvedValue({
      scorecardId: sc.id,
      teamId: fix.teamId,
      leagueId: fix.leagueId,
      weekNumber: 1,
    });

    const result = await saveHoleScore("valid-token", 1, 25);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("between 1 and 20");
  });

  it("rejects save on approved scorecard", async () => {
    const fix = await setupFixture();
    const sc = await createTestScorecard(fix, 1, "approved");

    mockedVerifyToken.mockResolvedValue({
      scorecardId: sc.id,
      teamId: fix.teamId,
      leagueId: fix.leagueId,
      weekNumber: 1,
    });

    const result = await saveHoleScore("valid-token", 1, 4);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("already approved");
  });

  it("resets rejected scorecard to in_progress on save", async () => {
    const fix = await setupFixture();
    const sc = await createTestScorecard(fix, 1, "rejected");

    mockedVerifyToken.mockResolvedValue({
      scorecardId: sc.id,
      teamId: fix.teamId,
      leagueId: fix.leagueId,
      weekNumber: 1,
    });

    const result = await saveHoleScore("valid-token", 1, 4);
    expect(result.success).toBe(true);

    const updated = await testPrisma.scorecard.findUnique({ where: { id: sc.id } });
    expect(updated!.status).toBe("in_progress");
  });
});

// ==========================================
// Player-Facing: submitScorecard
// ==========================================

describe("submitScorecard", () => {
  it("returns error for invalid token", async () => {
    mockedVerifyToken.mockResolvedValue(null);
    const result = await submitScorecard("bad-token");
    expect(result.success).toBe(false);
  });

  it("rejects submission with incomplete holes", async () => {
    const fix = await setupFixture();
    const sc = await createTestScorecard(fix);

    // Only fill 3 of 9 holes
    for (let i = 0; i < 3; i++) {
      await testPrisma.holeScore.create({
        data: { scorecardId: sc.id, holeId: fix.holeIds[i], holeNumber: i + 1, strokes: 4 },
      });
    }

    mockedVerifyToken.mockResolvedValue({
      scorecardId: sc.id,
      teamId: fix.teamId,
      leagueId: fix.leagueId,
      weekNumber: 1,
    });

    const result = await submitScorecard("valid-token");
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("all 9 holes");
  });

  it("submits scorecard with correct totals for 9-hole course", async () => {
    const fix = await setupFixture();
    const sc = await createTestScorecard(fix);
    await fillAllHoleScores(sc.id, fix, 4);

    mockedVerifyToken.mockResolvedValue({
      scorecardId: sc.id,
      teamId: fix.teamId,
      leagueId: fix.leagueId,
      weekNumber: 1,
    });

    const result = await submitScorecard("valid-token");
    const data = unwrap(result);

    expect(data.grossTotal).toBe(36); // 9 * 4
    expect(data.frontNine).toBe(36); // all 9 holes are <= 9
    expect(data.backNine).toBeNull(); // 9-hole course

    const updated = await testPrisma.scorecard.findUnique({ where: { id: sc.id } });
    expect(updated!.status).toBe("completed");
    expect(updated!.completedAt).not.toBeNull();
  });

  it("rejects submission on approved scorecard", async () => {
    const fix = await setupFixture();
    const sc = await createTestScorecard(fix, 1, "approved");
    await fillAllHoleScores(sc.id, fix, 4);

    mockedVerifyToken.mockResolvedValue({
      scorecardId: sc.id,
      teamId: fix.teamId,
      leagueId: fix.leagueId,
      weekNumber: 1,
    });

    const result = await submitScorecard("valid-token");
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("already approved");
  });
});

// ==========================================
// Admin: generateScorecardLink
// ==========================================

describe("generateScorecardLink", () => {
  it("generates a link for a valid team/week", async () => {
    const fix = await setupFixture();
    const result = await generateScorecardLink(fix.leagueSlug, fix.teamId, 1, fix.seasonId);
    const data = unwrap(result);

    expect(data.url).toContain(`/league/${fix.leagueSlug}/scorecard/`);
    expect(data.scorecardId).toBeGreaterThan(0);

    // Verify scorecard created in DB
    const sc = await testPrisma.scorecard.findUnique({ where: { id: data.scorecardId } });
    expect(sc).not.toBeNull();
    expect(sc!.accessToken).toBe("mock-scorecard-token");
  });

  it("returns error when no course configured", async () => {
    const league = unwrap(await createLeague("No Course League", "securepass123"));
    setAuthContext(league.id, league.slug, league.adminUsername);
    unwrap(await createSeason(league.slug, "Season 1", 2025));
    const team = unwrap(await createTeam(league.id, "Team A"));

    const result = await generateScorecardLink(league.slug, team.id, 1);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("No course configured");
  });

  it("returns error for non-existent team", async () => {
    const fix = await setupFixture();
    const result = await generateScorecardLink(fix.leagueSlug, 99999, 1);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("Team not found");
  });

  it("reuses existing scorecard for same team/week", async () => {
    const fix = await setupFixture();
    const r1 = unwrap(await generateScorecardLink(fix.leagueSlug, fix.teamId, 1));
    const r2 = unwrap(await generateScorecardLink(fix.leagueSlug, fix.teamId, 1));

    expect(r1.scorecardId).toBe(r2.scorecardId);
  });
});

// ==========================================
// Admin: approveScorecard
// ==========================================

describe("approveScorecard", () => {
  it("approves a completed scorecard", async () => {
    const fix = await setupFixture();
    const sc = await testPrisma.scorecard.create({
      data: {
        leagueId: fix.leagueId,
        courseId: fix.courseId,
        teamId: fix.teamId,
        weekNumber: 1,
        status: "completed",
        grossTotal: 36,
      },
    });

    const result = await approveScorecard(fix.leagueSlug, sc.id);
    expect(result.success).toBe(true);

    const updated = await testPrisma.scorecard.findUnique({ where: { id: sc.id } });
    expect(updated!.status).toBe("approved");
    expect(updated!.approvedAt).not.toBeNull();
  });

  it("rejects approval of already approved scorecard", async () => {
    const fix = await setupFixture();
    const sc = await createTestScorecard(fix, 1, "approved");
    const result = await approveScorecard(fix.leagueSlug, sc.id);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("already approved");
  });

  it("rejects approval of in_progress scorecard", async () => {
    const fix = await setupFixture();
    const sc = await createTestScorecard(fix, 1, "in_progress");
    const result = await approveScorecard(fix.leagueSlug, sc.id);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("not been submitted");
  });

  it("rejects approval when no gross total", async () => {
    const fix = await setupFixture();
    const sc = await testPrisma.scorecard.create({
      data: {
        leagueId: fix.leagueId,
        courseId: fix.courseId,
        teamId: fix.teamId,
        weekNumber: 1,
        status: "completed",
        grossTotal: null,
      },
    });

    const result = await approveScorecard(fix.leagueSlug, sc.id);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("no total score");
  });

  it("returns error for non-existent scorecard", async () => {
    const fix = await setupFixture();
    const result = await approveScorecard(fix.leagueSlug, 99999);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("not found");
  });
});

// ==========================================
// Admin: rejectScorecard
// ==========================================

describe("rejectScorecard", () => {
  it("rejects a completed scorecard", async () => {
    const fix = await setupFixture();
    const sc = await testPrisma.scorecard.create({
      data: {
        leagueId: fix.leagueId,
        courseId: fix.courseId,
        teamId: fix.teamId,
        weekNumber: 1,
        status: "completed",
        grossTotal: 36,
      },
    });

    const result = await rejectScorecard(fix.leagueSlug, sc.id);
    expect(result.success).toBe(true);

    const updated = await testPrisma.scorecard.findUnique({ where: { id: sc.id } });
    expect(updated!.status).toBe("rejected");
  });

  it("rejects rejection of in_progress scorecard", async () => {
    const fix = await setupFixture();
    const sc = await createTestScorecard(fix, 1, "in_progress");
    const result = await rejectScorecard(fix.leagueSlug, sc.id);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("not been submitted");
  });

  it("returns error for non-existent scorecard", async () => {
    const fix = await setupFixture();
    const result = await rejectScorecard(fix.leagueSlug, 99999);
    expect(result.success).toBe(false);
  });
});

// ==========================================
// Admin: getScorecardsForWeek
// ==========================================

describe("getScorecardsForWeek", () => {
  it("returns scorecard summaries for a week", async () => {
    const fix = await setupFixture();
    await createTestScorecard(fix, 1);

    const summaries = await getScorecardsForWeek(fix.leagueSlug, 1);
    expect(summaries).toHaveLength(1);
    expect(summaries[0].teamName).toBe("Team Alpha");
    expect(summaries[0].weekNumber).toBe(1);
    expect(summaries[0].status).toBe("in_progress");
    expect(summaries[0].totalHoles).toBe(9);
  });

  it("returns empty array for week with no scorecards", async () => {
    const fix = await setupFixture();
    const summaries = await getScorecardsForWeek(fix.leagueSlug, 99);
    expect(summaries).toEqual([]);
  });
});

// ==========================================
// Admin: getScorecardDetail
// ==========================================

describe("getScorecardDetail", () => {
  it("returns full scorecard detail", async () => {
    const fix = await setupFixture();
    const sc = await createTestScorecard(fix);
    await fillAllHoleScores(sc.id, fix, 5);

    const result = await getScorecardDetail(fix.leagueSlug, sc.id);
    const detail = unwrap(result);
    expect(detail.id).toBe(sc.id);
    expect(detail.course.holes).toHaveLength(9);
    expect(detail.holeScores).toHaveLength(9);
    expect(detail.holeScores[0].strokes).toBe(5);
  });

  it("returns error for non-existent scorecard", async () => {
    const fix = await setupFixture();
    const result = await getScorecardDetail(fix.leagueSlug, 99999);
    expect(result.success).toBe(false);
  });
});

// ==========================================
// Admin: adminSaveHoleScore
// ==========================================

describe("adminSaveHoleScore", () => {
  it("saves hole score and recalculates totals", async () => {
    const fix = await setupFixture();
    const sc = await createTestScorecard(fix);

    const result = await adminSaveHoleScore(fix.leagueSlug, sc.id, 1, 5);
    expect(result.success).toBe(true);

    const updated = await testPrisma.scorecard.findUnique({ where: { id: sc.id } });
    expect(updated!.grossTotal).toBe(5);
    expect(updated!.frontNine).toBe(5);
  });

  it("rejects strokes outside valid range", async () => {
    const fix = await setupFixture();
    const sc = await createTestScorecard(fix);

    const result = await adminSaveHoleScore(fix.leagueSlug, sc.id, 1, 0);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("between 1 and 20");
  });

  it("returns error for non-existent scorecard", async () => {
    const fix = await setupFixture();
    const result = await adminSaveHoleScore(fix.leagueSlug, 99999, 1, 4);
    expect(result.success).toBe(false);
  });

  it("upserts existing hole score", async () => {
    const fix = await setupFixture();
    const sc = await createTestScorecard(fix);

    await adminSaveHoleScore(fix.leagueSlug, sc.id, 1, 5);
    await adminSaveHoleScore(fix.leagueSlug, sc.id, 1, 3);

    const holeScore = await testPrisma.holeScore.findUnique({
      where: { scorecardId_holeNumber: { scorecardId: sc.id, holeNumber: 1 } },
    });
    expect(holeScore!.strokes).toBe(3);

    const updated = await testPrisma.scorecard.findUnique({ where: { id: sc.id } });
    expect(updated!.grossTotal).toBe(3);
  });
});

// ==========================================
// Admin: adminCompleteAndApproveScorecard
// ==========================================

describe("adminCompleteAndApproveScorecard", () => {
  it("completes and approves a fully scored card", async () => {
    const fix = await setupFixture();
    const sc = await createTestScorecard(fix);
    await fillAllHoleScores(sc.id, fix, 4);

    const result = await adminCompleteAndApproveScorecard(fix.leagueSlug, sc.id);
    expect(result.success).toBe(true);

    const updated = await testPrisma.scorecard.findUnique({ where: { id: sc.id } });
    expect(updated!.status).toBe("approved");
    expect(updated!.grossTotal).toBe(36);
    expect(updated!.completedAt).not.toBeNull();
    expect(updated!.approvedAt).not.toBeNull();
  });

  it("rejects if already approved", async () => {
    const fix = await setupFixture();
    const sc = await createTestScorecard(fix, 1, "approved");
    const result = await adminCompleteAndApproveScorecard(fix.leagueSlug, sc.id);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("already approved");
  });

  it("rejects if holes are incomplete", async () => {
    const fix = await setupFixture();
    const sc = await createTestScorecard(fix);

    // Fill only 3 holes
    for (let i = 0; i < 3; i++) {
      await testPrisma.holeScore.create({
        data: { scorecardId: sc.id, holeId: fix.holeIds[i], holeNumber: i + 1, strokes: 4 },
      });
    }

    const result = await adminCompleteAndApproveScorecard(fix.leagueSlug, sc.id);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("must have scores");
  });
});

// ==========================================
// Admin: adminCreateScorecard
// ==========================================

describe("adminCreateScorecard", () => {
  it("creates a new scorecard", async () => {
    const fix = await setupFixture();
    const result = await adminCreateScorecard(fix.leagueSlug, fix.teamId, 1, fix.seasonId);
    const detail = unwrap(result);

    expect(detail.teamId).toBe(fix.teamId);
    expect(detail.weekNumber).toBe(1);
    expect(detail.status).toBe("in_progress");
    expect(detail.course.numberOfHoles).toBe(9);
  });

  it("returns existing scorecard for same team/week", async () => {
    const fix = await setupFixture();
    const r1 = unwrap(await adminCreateScorecard(fix.leagueSlug, fix.teamId, 1, fix.seasonId));
    const r2 = unwrap(await adminCreateScorecard(fix.leagueSlug, fix.teamId, 1, fix.seasonId));

    expect(r1.id).toBe(r2.id);
  });

  it("returns error when no course configured", async () => {
    const league = unwrap(await createLeague("No Course League 2", "securepass123"));
    setAuthContext(league.id, league.slug, league.adminUsername);
    unwrap(await createSeason(league.slug, "Season 1", 2025));
    const team = unwrap(await createTeam(league.id, "Team Z"));

    const result = await adminCreateScorecard(league.slug, team.id, 1);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("No course configured");
  });

  it("returns error for non-existent team", async () => {
    const fix = await setupFixture();
    const result = await adminCreateScorecard(fix.leagueSlug, 99999, 1);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("Team not found");
  });
});

// ==========================================
// Admin: adminLinkScorecardToMatchup
// ==========================================

describe("adminLinkScorecardToMatchup", () => {
  it("unlinks a scorecard from matchup", async () => {
    const fix = await setupFixture();
    const sc = await createTestScorecard(fix);

    const result = await adminLinkScorecardToMatchup(fix.leagueSlug, sc.id, null, null);
    expect(result.success).toBe(true);

    const updated = await testPrisma.scorecard.findUnique({ where: { id: sc.id } });
    expect(updated!.matchupId).toBeNull();
    expect(updated!.teamSide).toBeNull();
  });

  it("returns error for non-existent scorecard", async () => {
    const fix = await setupFixture();
    const result = await adminLinkScorecardToMatchup(fix.leagueSlug, 99999, null, null);
    expect(result.success).toBe(false);
  });

  it("returns error for non-existent matchup", async () => {
    const fix = await setupFixture();
    const sc = await createTestScorecard(fix);

    const result = await adminLinkScorecardToMatchup(fix.leagueSlug, sc.id, 99999, "A");
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("Matchup not found");
  });
});

// ==========================================
// Public/Utility functions
// ==========================================

describe("getApprovedScorecardScores", () => {
  it("returns map of approved scores by team", async () => {
    const fix = await setupFixture();
    await testPrisma.scorecard.create({
      data: {
        leagueId: fix.leagueId,
        courseId: fix.courseId,
        teamId: fix.teamId,
        weekNumber: 1,
        status: "approved",
        grossTotal: 36,
      },
    });

    const scores = await getApprovedScorecardScores(fix.leagueId, 1);
    expect(scores.get(fix.teamId)).toBe(36);
  });

  it("excludes non-approved scorecards", async () => {
    const fix = await setupFixture();
    await createTestScorecard(fix, 1, "in_progress");

    const scores = await getApprovedScorecardScores(fix.leagueId, 1);
    expect(scores.size).toBe(0);
  });
});

describe("getPublicScorecardForTeamWeek", () => {
  it("returns approved scorecard", async () => {
    const fix = await setupFixture();
    await testPrisma.scorecard.create({
      data: {
        leagueId: fix.leagueId,
        courseId: fix.courseId,
        teamId: fix.teamId,
        weekNumber: 1,
        status: "approved",
        grossTotal: 38,
      },
    });

    const detail = await getPublicScorecardForTeamWeek(fix.leagueId, 1, fix.teamId);
    expect(detail).not.toBeNull();
    expect(detail!.grossTotal).toBe(38);
    expect(detail!.status).toBe("approved");
  });

  it("returns null for non-approved scorecard", async () => {
    const fix = await setupFixture();
    await createTestScorecard(fix, 1, "completed");

    const detail = await getPublicScorecardForTeamWeek(fix.leagueId, 1, fix.teamId);
    expect(detail).toBeNull();
  });

  it("returns null when no scorecard exists", async () => {
    const fix = await setupFixture();
    const detail = await getPublicScorecardForTeamWeek(fix.leagueId, 99, fix.teamId);
    expect(detail).toBeNull();
  });
});

describe("getPublicScorecardsForWeek", () => {
  it("returns only approved scorecards", async () => {
    const fix = await setupFixture();

    // One approved, one in_progress
    await testPrisma.scorecard.create({
      data: {
        leagueId: fix.leagueId,
        courseId: fix.courseId,
        teamId: fix.teamId,
        weekNumber: 1,
        status: "approved",
        grossTotal: 36,
      },
    });

    const team2 = unwrap(await createTeam(fix.leagueId, "Team Beta"));
    await testPrisma.scorecard.create({
      data: {
        leagueId: fix.leagueId,
        courseId: fix.courseId,
        teamId: team2.id,
        weekNumber: 1,
        status: "in_progress",
      },
    });

    const scorecards = await getPublicScorecardsForWeek(fix.leagueId, 1);
    expect(scorecards).toHaveLength(1);
    expect(scorecards[0].teamName).toBe("Team Alpha");
  });

  it("returns empty array for week with no approved scorecards", async () => {
    const fix = await setupFixture();
    const scorecards = await getPublicScorecardsForWeek(fix.leagueId, 99);
    expect(scorecards).toEqual([]);
  });
});

describe("getScorecardAvailabilityForSeason", () => {
  it("returns approved scorecards in the season", async () => {
    const fix = await setupFixture();
    await testPrisma.scorecard.create({
      data: {
        leagueId: fix.leagueId,
        courseId: fix.courseId,
        teamId: fix.teamId,
        seasonId: fix.seasonId,
        weekNumber: 1,
        status: "approved",
        grossTotal: 36,
      },
    });
    await testPrisma.scorecard.create({
      data: {
        leagueId: fix.leagueId,
        courseId: fix.courseId,
        teamId: fix.teamId,
        seasonId: fix.seasonId,
        weekNumber: 2,
        status: "in_progress",
      },
    });

    const avail = await getScorecardAvailabilityForSeason(fix.leagueId, fix.seasonId);
    expect(avail).toHaveLength(1);
    expect(avail[0].weekNumber).toBe(1);
    expect(avail[0].teamId).toBe(fix.teamId);
  });
});

describe("checkEmailConfigured", () => {
  it("returns false when email not configured", async () => {
    mockedIsEmailConfigured.mockReturnValue(false);
    const result = await checkEmailConfigured();
    expect(result).toBe(false);
  });

  it("returns true when email is configured", async () => {
    mockedIsEmailConfigured.mockReturnValue(true);
    const result = await checkEmailConfigured();
    expect(result).toBe(true);
  });
});

describe("emailScorecardLink", () => {
  it("returns error for team with no email", async () => {
    const fix = await setupFixture();
    // Team was created without email
    const result = await emailScorecardLink(fix.leagueSlug, fix.teamId, 1);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("No email address");
  });

  it("returns error for non-existent team", async () => {
    const fix = await setupFixture();
    const result = await emailScorecardLink(fix.leagueSlug, 99999, 1);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("Team not found");
  });
});
