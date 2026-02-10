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
    login: { maxAttempts: 100, windowMs: 60000 },
    sudoLogin: { maxAttempts: 100, windowMs: 60000 },
    createLeague: { maxAttempts: 100, windowMs: 60000 },
    registerTeam: { maxAttempts: 100, windowMs: 60000 },
  },
}));

// ==========================================
// Imports (after mocks)
// ==========================================

import { createCourse, updateCourse, deleteCourse, getCourseWithHoles, type CourseInput } from "@/lib/actions/courses";
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

function make9Holes() {
  return Array.from({ length: 9 }, (_, i) => ({
    holeNumber: i + 1,
    par: i % 3 === 0 ? 3 : i % 3 === 1 ? 4 : 5,
    handicapIndex: i + 1,
    yardage: 150 + i * 20,
  }));
}

function make18Holes() {
  return Array.from({ length: 18 }, (_, i) => ({
    holeNumber: i + 1,
    par: i % 3 === 0 ? 3 : i % 3 === 1 ? 4 : 5,
    handicapIndex: i + 1,
    yardage: 150 + i * 20,
  }));
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

describe("createCourse", () => {
  let leagueSlug: string;

  beforeEach(async () => {
    const league = unwrap(await createLeague("Course Test League", "securepass123"));
    leagueSlug = league.slug;
    setAuthContext(league.id, league.slug, league.adminUsername);
  });

  it("creates a 9-hole course with holes", async () => {
    const input: CourseInput = {
      name: "Pine Valley GC",
      numberOfHoles: 9,
      holes: make9Holes(),
    };
    const result = await createCourse(leagueSlug, input);
    const course = unwrap(result);

    expect(course.name).toBe("Pine Valley GC");
    expect(course.numberOfHoles).toBe(9);
    expect(course.isActive).toBe(true);
    expect(course.holes).toHaveLength(9);
    expect(course.totalPar).toBe(make9Holes().reduce((sum, h) => sum + h.par, 0));
  });

  it("creates an 18-hole course", async () => {
    const input: CourseInput = {
      name: "Augusta National",
      numberOfHoles: 18,
      holes: make18Holes(),
    };
    const course = unwrap(await createCourse(leagueSlug, input));
    expect(course.numberOfHoles).toBe(18);
    expect(course.holes).toHaveLength(18);
  });

  it("deactivates previous course when creating new one", async () => {
    const first = unwrap(await createCourse(leagueSlug, {
      name: "First Course",
      numberOfHoles: 9,
      holes: make9Holes(),
    }));
    expect(first.isActive).toBe(true);

    unwrap(await createCourse(leagueSlug, {
      name: "Second Course",
      numberOfHoles: 9,
      holes: make9Holes(),
    }));

    // First course should now be inactive
    const firstUpdated = await testPrisma.course.findUnique({ where: { id: first.id } });
    expect(firstUpdated!.isActive).toBe(false);
  });

  it("rejects mismatched hole count", async () => {
    const result = await createCourse(leagueSlug, {
      name: "Bad Course",
      numberOfHoles: 9,
      holes: make18Holes(), // 18 holes but declared 9
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("Expected 9 holes");
  });

  it("rejects duplicate handicap indexes", async () => {
    const holes = make9Holes();
    holes[1].handicapIndex = holes[0].handicapIndex; // duplicate
    const result = await createCourse(leagueSlug, {
      name: "Bad Course",
      numberOfHoles: 9,
      holes,
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("unique handicap index");
  });

  it("stores optional fields (location, teeColor, courseRating, slopeRating)", async () => {
    const course = unwrap(await createCourse(leagueSlug, {
      name: "Full Details GC",
      location: "Princeton, NJ",
      numberOfHoles: 9,
      teeColor: "Blue",
      courseRating: 72.5,
      slopeRating: 135,
      holes: make9Holes(),
    }));
    expect(course.location).toBe("Princeton, NJ");
    expect(course.teeColor).toBe("Blue");
    expect(course.courseRating).toBe(72.5);
    expect(course.slopeRating).toBe(135);
  });
});

describe("updateCourse", () => {
  let leagueSlug: string;
  let courseId: number;

  beforeEach(async () => {
    const league = unwrap(await createLeague("Update Course League", "securepass123"));
    leagueSlug = league.slug;
    setAuthContext(league.id, league.slug, league.adminUsername);

    const course = unwrap(await createCourse(leagueSlug, {
      name: "Original Course",
      numberOfHoles: 9,
      holes: make9Holes(),
    }));
    courseId = course.id;
  });

  it("updates course name and holes", async () => {
    const newHoles = make9Holes().map((h) => ({ ...h, par: 4 }));
    const updated = unwrap(await updateCourse(leagueSlug, courseId, {
      name: "Renamed Course",
      numberOfHoles: 9,
      holes: newHoles,
    }));
    expect(updated.name).toBe("Renamed Course");
    expect(updated.holes.every((h) => h.par === 4)).toBe(true);
  });

  it("returns error for non-existent course", async () => {
    const result = await updateCourse(leagueSlug, 99999, {
      name: "Ghost Course",
      numberOfHoles: 9,
      holes: make9Holes(),
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("not found");
  });
});

describe("deleteCourse", () => {
  let leagueSlug: string;
  let courseId: number;

  beforeEach(async () => {
    const league = unwrap(await createLeague("Delete Course League", "securepass123"));
    leagueSlug = league.slug;
    setAuthContext(league.id, league.slug, league.adminUsername);

    const course = unwrap(await createCourse(leagueSlug, {
      name: "Doomed Course",
      numberOfHoles: 9,
      holes: make9Holes(),
    }));
    courseId = course.id;
  });

  it("deletes a course with no scorecards", async () => {
    const result = await deleteCourse(leagueSlug, courseId);
    expect(result.success).toBe(true);

    const deleted = await testPrisma.course.findUnique({ where: { id: courseId } });
    expect(deleted).toBeNull();
  });

  it("returns error for non-existent course", async () => {
    const result = await deleteCourse(leagueSlug, 99999);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("not found");
  });
});

describe("getCourseWithHoles", () => {
  let leagueSlug: string;

  beforeEach(async () => {
    const league = unwrap(await createLeague("Get Course League", "securepass123"));
    leagueSlug = league.slug;
    setAuthContext(league.id, league.slug, league.adminUsername);
  });

  it("returns active course with holes", async () => {
    await createCourse(leagueSlug, {
      name: "Active Course",
      numberOfHoles: 9,
      holes: make9Holes(),
    });

    const course = await getCourseWithHoles(leagueSlug);
    expect(course).not.toBeNull();
    expect(course!.name).toBe("Active Course");
    expect(course!.holes).toHaveLength(9);
  });

  it("returns null when no active course exists", async () => {
    const course = await getCourseWithHoles(leagueSlug);
    expect(course).toBeNull();
  });
});
