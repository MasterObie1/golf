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

import { getLeagueAbout, updateLeagueAbout } from "@/lib/actions/league-about";
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

// ==========================================
// Lifecycle
// ==========================================

beforeAll(async () => { await cleanDatabase(); });
afterAll(async () => { await cleanDatabase(); await testPrisma.$disconnect(); });
beforeEach(async () => { await cleanDatabase(); });

// ==========================================
// Tests
// ==========================================

describe("getLeagueAbout", () => {
  it("returns league about fields with defaults", async () => {
    const league = unwrap(await createLeague("About Test League", "securepass123"));
    const about = await getLeagueAbout(league.id);

    expect(about.leagueName).toBe("About Test League");
    expect(about.registrationOpen).toBe(true);
    expect(about.maxTeams).toBe(16);
    expect(about.startDate).toBeNull();
    expect(about.endDate).toBeNull();
    expect(about.courseName).toBeNull();
    expect(about.contactEmail).toBeNull();
    expect(about.description).toBeNull();
  });
});

describe("updateLeagueAbout", () => {
  let leagueSlug: string;
  let leagueId: number;

  beforeEach(async () => {
    const league = unwrap(await createLeague("Update About League", "securepass123"));
    leagueSlug = league.slug;
    leagueId = league.id;
    setAuthContext(league.id, league.slug, league.adminUsername);
  });

  it("updates league about fields", async () => {
    const result = await updateLeagueAbout(leagueSlug, {
      leagueName: "Renamed League",
      startDate: new Date("2025-04-01"),
      endDate: new Date("2025-09-30"),
      numberOfWeeks: 20,
      courseName: "Pine Valley",
      courseLocation: "Princeton, NJ",
      playDay: "Thursday",
      playTime: "5:30 PM",
      entryFee: 50,
      prizeInfo: "Weekly prizes",
      description: "A fun league",
      contactEmail: "admin@test.com",
      contactPhone: "555-123-4567",
    });
    expect(result.success).toBe(true);

    const about = await getLeagueAbout(leagueId);
    expect(about.leagueName).toBe("Renamed League");
    expect(about.courseName).toBe("Pine Valley");
    expect(about.playDay).toBe("Thursday");
    expect(about.entryFee).toBe(50);
    expect(about.contactEmail).toBe("admin@test.com");
  });

  it("handles empty contactEmail as null", async () => {
    const result = await updateLeagueAbout(leagueSlug, {
      leagueName: "Test League",
      startDate: null,
      endDate: null,
      numberOfWeeks: null,
      courseName: null,
      courseLocation: null,
      playDay: null,
      playTime: null,
      entryFee: null,
      prizeInfo: null,
      description: null,
      contactEmail: "",
      contactPhone: null,
    });
    expect(result.success).toBe(true);

    const about = await getLeagueAbout(leagueId);
    expect(about.contactEmail).toBeNull();
  });

  it("rejects invalid input via Zod", async () => {
    const result = await updateLeagueAbout(leagueSlug, {
      leagueName: "", // too short — min 1
      startDate: null,
      endDate: null,
      numberOfWeeks: null,
      courseName: null,
      courseLocation: null,
      playDay: null,
      playTime: null,
      entryFee: null,
      prizeInfo: null,
      description: null,
      contactEmail: null,
      contactPhone: null,
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid email format", async () => {
    const result = await updateLeagueAbout(leagueSlug, {
      leagueName: "Test League",
      startDate: null,
      endDate: null,
      numberOfWeeks: null,
      courseName: null,
      courseLocation: null,
      playDay: null,
      playTime: null,
      entryFee: null,
      prizeInfo: null,
      description: null,
      contactEmail: "not-an-email",
      contactPhone: null,
    });
    expect(result.success).toBe(false);
  });
});
