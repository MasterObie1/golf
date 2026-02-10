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

// Now import the server actions and mocked auth
import {
  createLeague,
  getLeagueBySlug,
  getLeaguePublicInfo,
  getAllLeagues,
  searchLeagues,
  changeLeaguePassword,
  requireActiveLeague,
  requireLeagueNotCancelled,
} from "@/lib/actions/leagues";
import { createSeason } from "@/lib/actions/seasons";
import { createTeam } from "@/lib/actions/teams";
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

function unwrap<T>(result: { success: true; data: T } | { success: false; error: string }): T {
  if (!result.success) throw new Error(`Expected success but got error: ${result.error}`);
  return result.data;
}

// ==========================================
// Test lifecycle
// ==========================================

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
// requireActiveLeague
// ==========================================

describe("requireActiveLeague", () => {
  it("succeeds for an active league", async () => {
    const league = unwrap(await createLeague("Active League", "securepass123"));
    // Should not throw
    await expect(requireActiveLeague(league.id)).resolves.toBeUndefined();
  });

  it("throws for a suspended league", async () => {
    const league = unwrap(await createLeague("Suspended League", "securepass123"));
    await testPrisma.league.update({
      where: { id: league.id },
      data: { status: "suspended" },
    });

    await expect(requireActiveLeague(league.id)).rejects.toThrow("suspended");
  });

  it("throws for a cancelled league", async () => {
    const league = unwrap(await createLeague("Cancelled League", "securepass123"));
    await testPrisma.league.update({
      where: { id: league.id },
      data: { status: "cancelled" },
    });

    await expect(requireActiveLeague(league.id)).rejects.toThrow("cancelled");
  });

  it("throws for a non-existent league", async () => {
    await expect(requireActiveLeague(999999)).rejects.toThrow("League not found");
  });
});

// ==========================================
// requireLeagueNotCancelled
// ==========================================

describe("requireLeagueNotCancelled", () => {
  it("succeeds for an active league", async () => {
    const league = unwrap(await createLeague("Active League NC", "securepass123"));
    await expect(requireLeagueNotCancelled(league.id)).resolves.toBeUndefined();
  });

  it("succeeds for a suspended league (read-only access allowed)", async () => {
    const league = unwrap(await createLeague("Suspended League NC", "securepass123"));
    await testPrisma.league.update({
      where: { id: league.id },
      data: { status: "suspended" },
    });

    // Suspended is allowed — only cancelled throws
    await expect(requireLeagueNotCancelled(league.id)).resolves.toBeUndefined();
  });

  it("throws for a cancelled league", async () => {
    const league = unwrap(await createLeague("Cancelled League NC", "securepass123"));
    await testPrisma.league.update({
      where: { id: league.id },
      data: { status: "cancelled" },
    });

    await expect(requireLeagueNotCancelled(league.id)).rejects.toThrow("cancelled");
  });

  it("does not throw for a non-existent league", async () => {
    // The function only throws for cancelled — if league is not found, status is undefined
    await expect(requireLeagueNotCancelled(999999)).resolves.toBeUndefined();
  });
});

// ==========================================
// changeLeaguePassword
// ==========================================

describe("changeLeaguePassword", () => {
  let leagueSlug: string;
  let leagueId: number;

  beforeEach(async () => {
    const league = unwrap(await createLeague("Password Test League", "oldpassword1"));
    leagueSlug = league.slug;
    leagueId = league.id;
    setAuthContext(league.id, league.slug, league.adminUsername);
  });

  it("changes password with valid current password", async () => {
    const result = await changeLeaguePassword(leagueSlug, "oldpassword1", "newpassword1");
    expect(result.success).toBe(true);

    // Verify new password works by checking bcrypt hash in DB
    const bcrypt = await import("bcryptjs");
    const league = await testPrisma.league.findUnique({
      where: { id: leagueId },
      select: { adminPassword: true },
    });
    const isValid = await bcrypt.compare("newpassword1", league!.adminPassword);
    expect(isValid).toBe(true);
  });

  it("rejects incorrect current password", async () => {
    const result = await changeLeaguePassword(leagueSlug, "wrongpassword", "newpassword1");
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("Current password is incorrect");
  });

  it("rejects new password shorter than 8 characters", async () => {
    const result = await changeLeaguePassword(leagueSlug, "oldpassword1", "short");
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("at least 8 characters");
  });

  it("rejects empty current password", async () => {
    const result = await changeLeaguePassword(leagueSlug, "", "newpassword1");
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("required");
  });
});

// ==========================================
// searchLeagues
// ==========================================

describe("searchLeagues", () => {
  beforeEach(async () => {
    await createLeague("Sunset Golf League", "securepass123");
    await createLeague("Sunrise Golf Club", "securepass123");
    await createLeague("Mountain View Links", "securepass123");
  });

  it("returns matching leagues for a valid query", async () => {
    const results = await searchLeagues("Golf");
    expect(results.length).toBe(2);
    const names = results.map((l) => l.name);
    expect(names).toContain("Sunset Golf League");
    expect(names).toContain("Sunrise Golf Club");
  });

  it("returns empty array for query shorter than 2 characters", async () => {
    const results = await searchLeagues("G");
    expect(results).toEqual([]);
  });

  it("returns empty array for empty query", async () => {
    const results = await searchLeagues("");
    expect(results).toEqual([]);
  });

  it("returns empty array when no leagues match", async () => {
    const results = await searchLeagues("Nonexistent");
    expect(results).toEqual([]);
  });

  it("does not return sensitive fields", async () => {
    const results = await searchLeagues("Sunset");
    expect(results.length).toBe(1);
    const league = results[0] as Record<string, unknown>;
    expect(league.adminPassword).toBeUndefined();
    expect(league.adminUsername).toBeUndefined();
  });
});

// ==========================================
// getAllLeagues
// ==========================================

describe("getAllLeagues", () => {
  it("returns all leagues ordered by name", async () => {
    await createLeague("Bravo League", "securepass123");
    await createLeague("Alpha League", "securepass123");
    await createLeague("Charlie League", "securepass123");

    const leagues = await getAllLeagues();
    expect(leagues.length).toBe(3);
    expect(leagues[0].name).toBe("Alpha League");
    expect(leagues[1].name).toBe("Bravo League");
    expect(leagues[2].name).toBe("Charlie League");
  });

  it("returns empty array when no leagues exist", async () => {
    const leagues = await getAllLeagues();
    expect(leagues).toEqual([]);
  });

  it("includes team counts", async () => {
    const league = unwrap(await createLeague("Team Count League", "securepass123"));
    setAuthContext(league.id, league.slug, league.adminUsername);
    unwrap(await createSeason(league.slug, "Season 1", 2025));

    // Create an approved team
    const team = unwrap(await createTeam(league.id, "Test Team"));
    await testPrisma.team.update({
      where: { id: team.id },
      data: { status: "approved" },
    });

    const leagues = await getAllLeagues();
    const found = leagues.find((l) => l.slug === league.slug);
    expect(found).toBeDefined();
    expect(found!._count.teams).toBe(1);
  });
});

// ==========================================
// getLeagueBySlug
// ==========================================

describe("getLeagueBySlug", () => {
  it("returns league data for a valid slug", async () => {
    await createLeague("Slug Test League", "securepass123");

    const league = await getLeagueBySlug("slug-test-league");
    expect(league).not.toBeNull();
    expect(league!.name).toBe("Slug Test League");
    expect(league!.slug).toBe("slug-test-league");
    expect(league!.status).toBe("active");
  });

  it("does NOT return adminPassword or adminUsername", async () => {
    await createLeague("Security Check League", "securepass123");

    const league = await getLeagueBySlug("security-check-league");
    expect(league).not.toBeNull();
    const record = league as unknown as Record<string, unknown>;
    expect(record.adminPassword).toBeUndefined();
    expect(record.adminUsername).toBeUndefined();
  });

  it("returns null for non-existent slug", async () => {
    const league = await getLeagueBySlug("does-not-exist-at-all");
    expect(league).toBeNull();
  });

  it("includes handicap configuration fields", async () => {
    await createLeague("Handicap Config League", "securepass123");

    const league = await getLeagueBySlug("handicap-config-league");
    expect(league).not.toBeNull();
    // Verify handicap fields are present (defaults from schema)
    expect(league!.handicapBaseScore).toBeDefined();
    expect(league!.handicapMultiplier).toBeDefined();
    expect(league!.handicapMax).toBeDefined();
    expect(league!.handicapMin).toBeDefined();
  });
});

// ==========================================
// getLeaguePublicInfo
// ==========================================

describe("getLeaguePublicInfo", () => {
  it("returns public info with season and team counts", async () => {
    const league = unwrap(await createLeague("Public Info League", "securepass123"));
    setAuthContext(league.id, league.slug, league.adminUsername);
    unwrap(await createSeason(league.slug, "Season 1", 2025));

    const info = await getLeaguePublicInfo(league.slug);
    expect(info).not.toBeNull();
    expect(info!.name).toBe("Public Info League");
    expect(info!.seasons).toBeDefined();
    expect(info!.seasons.length).toBe(1);
    expect(info!.seasons[0].name).toBe("Season 1");
    expect(info!._count.teams).toBe(0);
  });

  it("returns null for non-existent slug", async () => {
    const info = await getLeaguePublicInfo("totally-nonexistent-slug");
    expect(info).toBeNull();
  });

  it("does not include sensitive admin fields", async () => {
    await createLeague("Public Safe League", "securepass123");

    const info = await getLeaguePublicInfo("public-safe-league");
    expect(info).not.toBeNull();
    const record = info as unknown as Record<string, unknown>;
    expect(record.adminPassword).toBeUndefined();
    expect(record.adminUsername).toBeUndefined();
  });
});
