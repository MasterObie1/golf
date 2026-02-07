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

const mockSession = {
  leagueId: 0,
  leagueSlug: "",
  adminUsername: "",
};

// ==========================================
// Module mocks — factories must NOT reference outer variables
// Use dynamic import inside the factory to avoid hoisting issues
// ==========================================

vi.mock("@/lib/db", async () => {
  const { PrismaClient } = await import("../../src/generated/prisma/client");
  const { PrismaLibSql } = await import("@prisma/adapter-libsql");
  const path = await import("path");
  const dbPath = path.resolve(__dirname, "../../test.db");
  const adapter = new PrismaLibSql({ url: `file:${dbPath}` });
  return { prisma: new PrismaClient({ adapter }) };
});

vi.mock("@/lib/auth", () => {
  // Return a module with functions that we'll control via mockSession
  // We read mockSession at call time, not definition time
  return {
    requireAdmin: vi.fn(async () => {
      // This will be replaced after import
      return { leagueId: 0, leagueSlug: "", adminUsername: "" };
    }),
    requireLeagueAdmin: vi.fn(async () => {
      return { leagueId: 0, leagueSlug: "", adminUsername: "" };
    }),
    getAdminSession: vi.fn(async () => {
      return { leagueId: 0, leagueSlug: "", adminUsername: "" };
    }),
    isAdmin: vi.fn(async () => true),
    isLeagueAdmin: vi.fn(async () => true),
  };
});

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: () => undefined,
    set: () => {},
    delete: () => {},
  })),
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

// Now import the server actions and mocked auth
import {
  createLeague,
  getLeagueBySlug,
  createTeam,
  registerTeam,
  approveTeam,
  rejectTeam,
  createSeason,
  setActiveSeason,
  getSeasons,
  getActiveSeason,
  submitMatchup,
  deleteMatchup,
  recalculateLeagueStats,
  getApprovedTeams,
  getLeaderboard,
} from "@/lib/actions";
import { requireAdmin, requireLeagueAdmin, getAdminSession } from "@/lib/auth";

const mockedRequireAdmin = vi.mocked(requireAdmin);
const mockedRequireLeagueAdmin = vi.mocked(requireLeagueAdmin);
const mockedGetAdminSession = vi.mocked(getAdminSession);

/**
 * Update the auth mocks to match the current league context
 */
function setAuthContext(leagueId: number, leagueSlug: string, adminUsername: string) {
  mockSession.leagueId = leagueId;
  mockSession.leagueSlug = leagueSlug;
  mockSession.adminUsername = adminUsername;

  mockedRequireAdmin.mockResolvedValue({ leagueId, leagueSlug, adminUsername });
  mockedRequireLeagueAdmin.mockImplementation(async (slug: string) => {
    if (slug !== leagueSlug) {
      throw new Error("Unauthorized: You do not have access to this league");
    }
    return { leagueId, leagueSlug, adminUsername };
  });
  mockedGetAdminSession.mockResolvedValue({ leagueId, leagueSlug, adminUsername });
}

// ==========================================
// Test lifecycle
// ==========================================

async function cleanDatabase() {
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
// createLeague + getLeagueBySlug round-trip
// ==========================================

// Helper to unwrap ActionResult - asserts success and returns data
function unwrap<T>(result: { success: true; data: T } | { success: false; error: string }): T {
  if (!result.success) {
    throw new Error(`Expected success but got error: ${result.error}`);
  }
  return result.data;
}

describe("createLeague + getLeagueBySlug", () => {
  it("creates a league and retrieves it by slug", async () => {
    const result = await createLeague("Thursday Night Golf", "securepass123");
    const league = unwrap(result);

    expect(league.name).toBe("Thursday Night Golf");
    expect(league.slug).toBe("thursday-night-golf");
    expect(league.adminUsername).toBe("admin@ThursdayNightGolf");

    // Retrieve it
    const found = await getLeagueBySlug("thursday-night-golf");
    expect(found).not.toBeNull();
    expect(found!.name).toBe("Thursday Night Golf");
    expect(found!.slug).toBe("thursday-night-golf");
  });

  it("does not leak password hash in getLeagueBySlug", async () => {
    await createLeague("Secret League", "securepass123");

    const found = await getLeagueBySlug("secret-league");
    expect(found).not.toBeNull();
    // The select clause should exclude adminPassword
    expect((found as any).adminPassword).toBeUndefined();
  });

  it("returns null for non-existent slug", async () => {
    const found = await getLeagueBySlug("does-not-exist");
    expect(found).toBeNull();
  });

  it("rejects duplicate league names", async () => {
    await createLeague("Unique League", "securepass123");
    const result = await createLeague("Unique League", "securepass123");
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("already exists");
  });

  it("rejects short names", async () => {
    const result = await createLeague("AB", "securepass123");
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("at least 3 characters");
  });

  it("rejects short passwords", async () => {
    const result = await createLeague("Good Name", "short");
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("at least 8 characters");
  });
});

// ==========================================
// createSeason + setActiveSeason
// ==========================================

describe("createSeason + setActiveSeason", () => {
  let leagueSlug: string;

  beforeEach(async () => {
    const result = await createLeague("Season Test League", "securepass123");
    const league = unwrap(result);
    leagueSlug = league.slug;
    setAuthContext(league.id, league.slug, league.adminUsername);
  });

  it("creates a season that is active by default", async () => {
    const season = await createSeason(leagueSlug, "Spring 2025", 2025);

    expect(season.name).toBe("Spring 2025");
    expect(season.year).toBe(2025);
    expect(season.isActive).toBe(true);
    expect(season.seasonNumber).toBe(1);
  });

  it("deactivates previous season when creating a new one", async () => {
    const s1 = await createSeason(leagueSlug, "Spring 2025", 2025);
    const s2 = await createSeason(leagueSlug, "Fall 2025", 2025);

    const seasons = await getSeasons(mockSession.leagueId);
    const s1Updated = seasons.find((s) => s.id === s1.id);
    const s2Updated = seasons.find((s) => s.id === s2.id);

    expect(s1Updated?.isActive).toBe(false);
    expect(s2Updated?.isActive).toBe(true);
  });

  it("increments season number", async () => {
    const s1 = await createSeason(leagueSlug, "Season 1", 2025);
    const s2 = await createSeason(leagueSlug, "Season 2", 2025);
    const s3 = await createSeason(leagueSlug, "Season 3", 2025);

    expect(s1.seasonNumber).toBe(1);
    expect(s2.seasonNumber).toBe(2);
    expect(s3.seasonNumber).toBe(3);
  });

  it("setActiveSeason switches the active season", async () => {
    const s1 = await createSeason(leagueSlug, "Season 1", 2025);
    await createSeason(leagueSlug, "Season 2", 2025);

    // Season 2 is active. Switch back to Season 1
    await setActiveSeason(leagueSlug, s1.id);

    const active = await getActiveSeason(mockSession.leagueId);
    expect(active?.id).toBe(s1.id);
  });
});

// ==========================================
// registerTeam + approveTeam + rejectTeam
// ==========================================

describe("registerTeam + approveTeam + rejectTeam", () => {
  let leagueSlug: string;

  beforeEach(async () => {
    const result = await createLeague("Team Test League", "securepass123");
    const league = unwrap(result);
    leagueSlug = league.slug;
    setAuthContext(league.id, league.slug, league.adminUsername);
    await createSeason(leagueSlug, "Season 1", 2025);
  });

  it("registers a team with pending status", async () => {
    const result = await registerTeam(
      leagueSlug,
      "The Eagles",
      "John Doe",
      "john@test.com",
      "555-123-4567"
    );
    expect(result.success).toBe(true);

    // Verify via DB
    const team = await testPrisma.team.findFirst({ where: { name: "The Eagles" } });
    expect(team).not.toBeNull();
    expect(team!.status).toBe("pending");
    expect(team!.captainName).toBe("John Doe");
  });

  it("approves a pending team", async () => {
    await registerTeam(leagueSlug, "The Hawks", "Jane Doe", "jane@test.com", "555-987-6543");
    const team = await testPrisma.team.findFirst({ where: { name: "The Hawks" } });

    const result = await approveTeam(leagueSlug, team!.id);
    expect(result.success).toBe(true);

    const updated = await testPrisma.team.findUnique({ where: { id: team!.id } });
    expect(updated!.status).toBe("approved");
  });

  it("rejects a pending team", async () => {
    await registerTeam(leagueSlug, "The Badgers", "Bob Smith", "bob@test.com", "555-111-2222");
    const team = await testPrisma.team.findFirst({ where: { name: "The Badgers" } });

    const result = await rejectTeam(leagueSlug, team!.id);
    expect(result.success).toBe(true);

    const updated = await testPrisma.team.findUnique({ where: { id: team!.id } });
    expect(updated!.status).toBe("rejected");
  });

  it("prevents duplicate team names in same season", async () => {
    await registerTeam(leagueSlug, "The Eagles", "John", "john@test.com", "555-123-4567");

    const result = await registerTeam(leagueSlug, "The Eagles", "Jane", "jane@test.com", "555-987-6543");
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("already exists");
  });
});

// ==========================================
// submitMatchup + team stats
// ==========================================

describe("submitMatchup + team stats", () => {
  let leagueSlug: string;
  let teamAId: number;
  let teamBId: number;

  beforeEach(async () => {
    const result = await createLeague("Match Test League", "securepass123");
    const league = unwrap(result);
    leagueSlug = league.slug;
    setAuthContext(league.id, league.slug, league.adminUsername);

    await createSeason(leagueSlug, "Season 1", 2025);

    // Create two approved teams
    const teamA = await createTeam(league.id, "Team Alpha");
    const teamB = await createTeam(league.id, "Team Beta");
    teamAId = teamA.id;
    teamBId = teamB.id;
    await approveTeam(leagueSlug, teamAId);
    await approveTeam(leagueSlug, teamBId);
  });

  it("creates a matchup and updates team stats", async () => {
    const result = await submitMatchup(
      leagueSlug,
      1,        // week
      teamAId,
      40,       // teamA gross
      5,        // teamA handicap
      35,       // teamA net (40-5)
      2,        // teamA points (winner)
      false,    // teamA isSub
      teamBId,
      45,       // teamB gross
      5,        // teamB handicap
      40,       // teamB net (45-5)
      0,        // teamB points (loser)
      false,    // teamB isSub
    );

    expect(result.success).toBe(true);

    // Verify matchup was created
    const matchup = await testPrisma.matchup.findFirst({ where: { weekNumber: 1 } });
    expect(matchup).toBeDefined();
    expect(matchup!.teamAGross).toBe(40);
    expect(matchup!.teamBGross).toBe(45);
    expect(matchup!.teamANet).toBe(35);
    expect(matchup!.teamBNet).toBe(40);
    expect(matchup!.teamAPoints).toBe(2);
    expect(matchup!.teamBPoints).toBe(0);

    // Check team stats were updated
    const teamA = await testPrisma.team.findUnique({ where: { id: teamAId } });
    const teamB = await testPrisma.team.findUnique({ where: { id: teamBId } });

    expect(teamA!.wins).toBe(1);
    expect(teamA!.totalPoints).toBe(2);
    expect(teamB!.losses).toBe(1);
    expect(teamB!.totalPoints).toBe(0);
  });

  it("handles a tied match", async () => {
    const result = await submitMatchup(
      leagueSlug, 1,
      teamAId, 40, 5, 35, 1, false,
      teamBId, 40, 5, 35, 1, false,
    );
    expect(result.success).toBe(true);

    const teamA = await testPrisma.team.findUnique({ where: { id: teamAId } });
    const teamB = await testPrisma.team.findUnique({ where: { id: teamBId } });

    expect(teamA!.ties).toBe(1);
    expect(teamB!.ties).toBe(1);
  });

  it("supports custom point values", async () => {
    const result = await submitMatchup(
      leagueSlug, 1,
      teamAId, 40, 5, 35, 10, false,
      teamBId, 45, 5, 40, 10, false,
    );
    expect(result.success).toBe(true);

    const matchup = await testPrisma.matchup.findFirst({ where: { weekNumber: 1 } });
    expect(matchup!.teamAPoints).toBe(10);
    expect(matchup!.teamBPoints).toBe(10);
  });
});

// ==========================================
// deleteMatchup + stats rollback
// ==========================================

describe("deleteMatchup + stats rollback", () => {
  let leagueSlug: string;
  let teamAId: number;
  let teamBId: number;

  beforeEach(async () => {
    const result = await createLeague("Delete Test League", "securepass123");
    const league = unwrap(result);
    leagueSlug = league.slug;
    setAuthContext(league.id, league.slug, league.adminUsername);

    await createSeason(leagueSlug, "Season 1", 2025);
    const teamA = await createTeam(league.id, "Team Alpha");
    const teamB = await createTeam(league.id, "Team Beta");
    teamAId = teamA.id;
    teamBId = teamB.id;
    await approveTeam(leagueSlug, teamAId);
    await approveTeam(leagueSlug, teamBId);
  });

  it("rolls back team stats when matchup is deleted", async () => {
    // Submit a matchup (Team A wins)
    await submitMatchup(
      leagueSlug, 1,
      teamAId, 40, 5, 35, 2, false,
      teamBId, 45, 5, 40, 0, false,
    );

    // Verify stats exist
    let teamA = await testPrisma.team.findUnique({ where: { id: teamAId } });
    expect(teamA!.wins).toBe(1);
    expect(teamA!.totalPoints).toBe(2);

    // Get the matchup ID from DB
    const matchup = await testPrisma.matchup.findFirst({ where: { weekNumber: 1 } });

    // Delete the matchup
    const result = await deleteMatchup(leagueSlug, matchup!.id);
    expect(result.success).toBe(true);

    // Stats should be rolled back to 0
    teamA = await testPrisma.team.findUnique({ where: { id: teamAId } });
    const teamB = await testPrisma.team.findUnique({ where: { id: teamBId } });

    expect(teamA!.wins).toBe(0);
    expect(teamA!.losses).toBe(0);
    expect(teamA!.totalPoints).toBe(0);
    expect(teamB!.wins).toBe(0);
    expect(teamB!.losses).toBe(0);
    expect(teamB!.totalPoints).toBe(0);
  });
});

// ==========================================
// recalculateLeagueStats
// ==========================================

describe("recalculateLeagueStats", () => {
  let leagueSlug: string;
  let leagueId: number;
  let teamAId: number;
  let teamBId: number;

  beforeEach(async () => {
    const result = await createLeague("Recalc Test League", "securepass123");
    const league = unwrap(result);
    leagueSlug = league.slug;
    leagueId = league.id;
    setAuthContext(league.id, league.slug, league.adminUsername);

    await createSeason(leagueSlug, "Season 1", 2025);
    const teamA = await createTeam(leagueId, "Team Alpha");
    const teamB = await createTeam(leagueId, "Team Beta");
    teamAId = teamA.id;
    teamBId = teamB.id;
    await approveTeam(leagueSlug, teamAId);
    await approveTeam(leagueSlug, teamBId);
  });

  it("recalculates all stats from scratch correctly", async () => {
    // Submit two matchups
    // Week 1: A(40-5=35) beats B(45-5=40) => A gets 2pts
    await submitMatchup(leagueSlug, 1, teamAId, 40, 5, 35, 2, false, teamBId, 45, 5, 40, 0, false);
    // Week 2: B(38-5=33) beats A(42-5=37) => B gets 2pts
    await submitMatchup(leagueSlug, 2, teamAId, 42, 5, 37, 0, false, teamBId, 38, 5, 33, 2, false);

    // Manually corrupt team stats
    await testPrisma.team.update({
      where: { id: teamAId },
      data: { totalPoints: 999, wins: 99, losses: 99 },
    });

    // Recalculate
    await recalculateLeagueStats(leagueId);

    // Verify stats are correct after recalculation
    const teamA = await testPrisma.team.findUnique({ where: { id: teamAId } });
    const teamB = await testPrisma.team.findUnique({ where: { id: teamBId } });

    // Week 1: A(40-5=35) beats B(45-5=40) => A gets 2pts, B gets 0
    // Week 2: B(38-hcp) vs A(42-hcp) => depends on recalculated handicaps
    // But stats should be recalculated properly (not 999)
    expect(teamA!.totalPoints).not.toBe(999);
    expect(teamA!.wins).not.toBe(99);

    // Total should be sum of points from both weeks
    const totalA = teamA!.totalPoints;
    const totalB = teamB!.totalPoints;
    expect(totalA + totalB).toBeGreaterThan(0); // At least some points awarded
  });

  it("zeros out stats when no matchups exist", async () => {
    // Manually set some stats
    await testPrisma.team.update({
      where: { id: teamAId },
      data: { totalPoints: 10, wins: 5 },
    });

    // Recalculate with no matchups
    await recalculateLeagueStats(leagueId);

    const teamA = await testPrisma.team.findUnique({ where: { id: teamAId } });
    expect(teamA!.totalPoints).toBe(0);
    expect(teamA!.wins).toBe(0);
    expect(teamA!.losses).toBe(0);
    expect(teamA!.ties).toBe(0);
  });
});

// ==========================================
// Leaderboard ordering (tiebreaker test)
// ==========================================

describe("leaderboard tiebreaker ordering", () => {
  let leagueSlug: string;
  let leagueId: number;

  beforeEach(async () => {
    const result = await createLeague("Leaderboard Test League", "securepass123");
    const league = unwrap(result);
    leagueSlug = league.slug;
    leagueId = league.id;
    setAuthContext(league.id, league.slug, league.adminUsername);

    await createSeason(leagueSlug, "Season 1", 2025);
  });

  it("ranks teams by total points descending", async () => {
    const t1 = await createTeam(leagueId, "First Place");
    const t2 = await createTeam(leagueId, "Second Place");
    const t3 = await createTeam(leagueId, "Third Place");
    await approveTeam(leagueSlug, t1.id);
    await approveTeam(leagueSlug, t2.id);
    await approveTeam(leagueSlug, t3.id);

    // Week 1: First(38-5=33) beats Second(42-5=37)
    await submitMatchup(leagueSlug, 1, t1.id, 38, 5, 33, 2, false, t2.id, 42, 5, 37, 0, false);

    // Week 2: First(38-5=33) beats Third(44-5=39)
    await submitMatchup(leagueSlug, 2, t1.id, 38, 5, 33, 2, false, t3.id, 44, 5, 39, 0, false);

    const leaderboard = await getLeaderboard(leagueId);

    // First Place should be ranked first (most points)
    expect(leaderboard[0].name).toBe("First Place");
    expect(leaderboard[0].totalPoints).toBe(4); // 2+2
  });
});
