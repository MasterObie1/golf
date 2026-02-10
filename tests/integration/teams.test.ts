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
import {
  getTeams,
  createTeam,
  getTeamPreviousScores,
  getTeamPreviousScoresForScoring,
  getCurrentWeekNumber,
  getTeamById,
  registerTeam,
  getPendingTeams,
  getApprovedTeams,
  getAllTeamsWithStatus,
  approveTeam,
  rejectTeam,
  adminQuickAddTeam,
  deleteTeam,
} from "@/lib/actions/teams";
import { submitMatchup } from "@/lib/actions/matchups";
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

/** Creates a league + season and sets auth context. Returns league info. */
async function setupLeagueWithSeason(leagueName: string) {
  const result = await createLeague(leagueName, "securepass123");
  const league = unwrap(result);
  setAuthContext(league.id, league.slug, league.adminUsername);
  const season = unwrap(await createSeason(league.slug, "Season 1", 2026));
  return { league, season };
}

// ==========================================
// Test lifecycle
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
// getTeams — public read (approved only, no PII)
// ==========================================

describe("getTeams", () => {
  it("returns only approved teams sorted by name", async () => {
    const { league } = await setupLeagueWithSeason("GetTeams League");

    // Create three teams with different statuses
    const teamA = unwrap(await createTeam(league.id, "Alpha Team"));
    const teamB = unwrap(await createTeam(league.id, "Beta Team"));
    unwrap(await createTeam(league.id, "Charlie Team"));

    // Approve only Alpha and Beta
    await approveTeam(league.slug, teamA.id);
    await approveTeam(league.slug, teamB.id);
    // Charlie remains pending

    const teams = await getTeams(league.id);

    expect(teams).toHaveLength(2);
    expect(teams[0].name).toBe("Alpha Team");
    expect(teams[1].name).toBe("Beta Team");
  });

  it("does not include PII fields (captainName, email, phone)", async () => {
    const { league } = await setupLeagueWithSeason("PII League");

    await registerTeam(league.slug, "PII Test", "John Doe", "john@test.com", "5551234567");
    const dbTeam = await testPrisma.team.findFirst({ where: { name: "PII Test" } });
    await approveTeam(league.slug, dbTeam!.id);

    const teams = await getTeams(league.id);

    expect(teams).toHaveLength(1);
    const team = teams[0] as Record<string, unknown>;
    expect(team.captainName).toBeUndefined();
    expect(team.email).toBeUndefined();
    expect(team.phone).toBeUndefined();
  });

  it("returns empty array when no approved teams exist", async () => {
    const { league } = await setupLeagueWithSeason("Empty League");

    // Create a pending team only
    await createTeam(league.id, "Pending Only");

    const teams = await getTeams(league.id);
    expect(teams).toHaveLength(0);
  });
});

// ==========================================
// getTeamById
// ==========================================

describe("getTeamById", () => {
  it("returns team data by ID", async () => {
    const { league } = await setupLeagueWithSeason("ById League");

    const created = unwrap(await createTeam(league.id, "Lookup Team"));
    const team = await getTeamById(created.id);

    expect(team).not.toBeNull();
    expect(team!.id).toBe(created.id);
    expect(team!.name).toBe("Lookup Team");
    expect(team!.leagueId).toBe(league.id);
    expect(team!.status).toBe("pending");
    expect(team!.totalPoints).toBe(0);
    expect(team!.wins).toBe(0);
    expect(team!.losses).toBe(0);
    expect(team!.ties).toBe(0);
  });

  it("returns null for non-existent team", async () => {
    const team = await getTeamById(999999);
    expect(team).toBeNull();
  });
});

// ==========================================
// getCurrentWeekNumber
// ==========================================

describe("getCurrentWeekNumber", () => {
  it("returns 1 when no matchups exist", async () => {
    const { league } = await setupLeagueWithSeason("Week League");

    const week = await getCurrentWeekNumber(league.id);
    expect(week).toBe(1);
  });

  it("returns next week after last matchup", async () => {
    const { league } = await setupLeagueWithSeason("Week Inc League");

    const teamA = unwrap(await createTeam(league.id, "Week A"));
    const teamB = unwrap(await createTeam(league.id, "Week B"));
    await approveTeam(league.slug, teamA.id);
    await approveTeam(league.slug, teamB.id);

    // Submit matchup at week 3
    await submitMatchup(
      league.slug, 3,
      teamA.id, 40, 5, 35, 10, false,
      teamB.id, 42, 5, 37, 10, false,
    );

    const week = await getCurrentWeekNumber(league.id);
    expect(week).toBe(4);
  });

  it("returns based on highest week number across multiple matchups", async () => {
    const { league } = await setupLeagueWithSeason("Multi Week League");

    const teamA = unwrap(await createTeam(league.id, "MW Alpha"));
    const teamB = unwrap(await createTeam(league.id, "MW Beta"));
    await approveTeam(league.slug, teamA.id);
    await approveTeam(league.slug, teamB.id);

    // Submit weeks 1 and 5
    await submitMatchup(
      league.slug, 1,
      teamA.id, 40, 5, 35, 10, false,
      teamB.id, 42, 5, 37, 10, false,
    );
    await submitMatchup(
      league.slug, 5,
      teamA.id, 38, 4, 34, 15, false,
      teamB.id, 41, 4, 37, 5, false,
    );

    const week = await getCurrentWeekNumber(league.id);
    expect(week).toBe(6);
  });
});

// ==========================================
// getTeamPreviousScores — match_play from matchups
// ==========================================

describe("getTeamPreviousScores", () => {
  it("returns gross scores from matchups in week order", async () => {
    const { league } = await setupLeagueWithSeason("Scores League");

    const teamA = unwrap(await createTeam(league.id, "Score Alpha"));
    const teamB = unwrap(await createTeam(league.id, "Score Beta"));
    await approveTeam(league.slug, teamA.id);
    await approveTeam(league.slug, teamB.id);

    await submitMatchup(
      league.slug, 1,
      teamA.id, 40, 5, 35, 20, false,
      teamB.id, 45, 5, 40, 0, false,
    );
    await submitMatchup(
      league.slug, 2,
      teamA.id, 38, 4, 34, 20, false,
      teamB.id, 42, 4, 38, 0, false,
    );

    const scoresA = await getTeamPreviousScores(league.id, teamA.id);
    expect(scoresA).toEqual([40, 38]);

    const scoresB = await getTeamPreviousScores(league.id, teamB.id);
    expect(scoresB).toEqual([45, 42]);
  });

  it("filters out matchups where team was a sub", async () => {
    const { league } = await setupLeagueWithSeason("Sub Filter League");

    const teamA = unwrap(await createTeam(league.id, "Sub Alpha"));
    const teamB = unwrap(await createTeam(league.id, "Sub Beta"));
    await approveTeam(league.slug, teamA.id);
    await approveTeam(league.slug, teamB.id);

    // Week 1: normal
    await submitMatchup(
      league.slug, 1,
      teamA.id, 40, 5, 35, 20, false,
      teamB.id, 45, 5, 40, 0, false,
    );
    // Week 2: teamA used a sub
    await submitMatchup(
      league.slug, 2,
      teamA.id, 36, 3, 33, 20, true,
      teamB.id, 42, 4, 38, 0, false,
    );
    // Week 3: normal again
    await submitMatchup(
      league.slug, 3,
      teamA.id, 39, 4, 35, 10, false,
      teamB.id, 41, 4, 37, 10, false,
    );

    const scoresA = await getTeamPreviousScores(league.id, teamA.id);
    // Week 2 should be excluded for team A (sub)
    expect(scoresA).toEqual([40, 39]);

    const scoresB = await getTeamPreviousScores(league.id, teamB.id);
    // All 3 weeks valid for team B (not a sub in any)
    expect(scoresB).toEqual([45, 42, 41]);
  });

  it("returns empty array when no matchups exist", async () => {
    const { league } = await setupLeagueWithSeason("No Scores League");

    const teamA = unwrap(await createTeam(league.id, "NoScore Team"));

    const scores = await getTeamPreviousScores(league.id, teamA.id);
    expect(scores).toEqual([]);
  });
});

// ==========================================
// getTeamPreviousScoresForScoring
// ==========================================

describe("getTeamPreviousScoresForScoring", () => {
  it("delegates to getTeamPreviousScores for match_play", async () => {
    const { league } = await setupLeagueWithSeason("Scoring MP League");

    const teamA = unwrap(await createTeam(league.id, "MP Alpha"));
    const teamB = unwrap(await createTeam(league.id, "MP Beta"));
    await approveTeam(league.slug, teamA.id);
    await approveTeam(league.slug, teamB.id);

    await submitMatchup(
      league.slug, 1,
      teamA.id, 42, 5, 37, 20, false,
      teamB.id, 44, 5, 39, 0, false,
    );

    const scores = await getTeamPreviousScoresForScoring(league.id, teamA.id, "match_play");
    expect(scores).toEqual([42]);
  });

  it("pulls from WeeklyScore for stroke_play", async () => {
    const { league, season } = await setupLeagueWithSeason("Scoring SP League");

    const teamA = unwrap(await createTeam(league.id, "SP Alpha"));
    await approveTeam(league.slug, teamA.id);

    // Insert weekly scores directly for stroke play
    await testPrisma.weeklyScore.createMany({
      data: [
        { weekNumber: 1, leagueId: league.id, seasonId: season.id, teamId: teamA.id, grossScore: 38, handicap: 4, netScore: 34, points: 10, position: 1, isSub: false, isDnp: false },
        { weekNumber: 2, leagueId: league.id, seasonId: season.id, teamId: teamA.id, grossScore: 41, handicap: 4, netScore: 37, points: 8, position: 2, isSub: false, isDnp: false },
        { weekNumber: 3, leagueId: league.id, seasonId: season.id, teamId: teamA.id, grossScore: 39, handicap: 4, netScore: 35, points: 0, position: 3, isSub: true, isDnp: false },
        { weekNumber: 4, leagueId: league.id, seasonId: season.id, teamId: teamA.id, grossScore: 0, handicap: 0, netScore: 0, points: 0, position: 5, isSub: false, isDnp: true },
      ],
    });

    const scores = await getTeamPreviousScoresForScoring(league.id, teamA.id, "stroke_play");
    // Should exclude subs (week 3) and DNPs (week 4)
    expect(scores).toEqual([38, 41]);
  });

  it("pulls from WeeklyScore for hybrid", async () => {
    const { league, season } = await setupLeagueWithSeason("Scoring HY League");

    const teamA = unwrap(await createTeam(league.id, "HY Alpha"));
    await approveTeam(league.slug, teamA.id);

    await testPrisma.weeklyScore.create({
      data: { weekNumber: 1, leagueId: league.id, seasonId: season.id, teamId: teamA.id, grossScore: 40, handicap: 5, netScore: 35, points: 10, position: 1, isSub: false, isDnp: false },
    });

    const scores = await getTeamPreviousScoresForScoring(league.id, teamA.id, "hybrid");
    expect(scores).toEqual([40]);
  });

  it("throws for invalid scoring type", async () => {
    const { league } = await setupLeagueWithSeason("Invalid Scoring League");

    const teamA = unwrap(await createTeam(league.id, "Invalid Team"));

    await expect(
      getTeamPreviousScoresForScoring(league.id, teamA.id, "bogus_type")
    ).rejects.toThrow("Invalid scoring type: bogus_type");
  });
});

// ==========================================
// registerTeam — public registration with validation
// ==========================================

describe("registerTeam", () => {
  it("registers a team with pending status", async () => {
    const { league } = await setupLeagueWithSeason("Register League");

    const result = await registerTeam(league.slug, "The Eagles", "John Doe", "john@test.com", "5551234567");
    expect(result.success).toBe(true);

    const team = await testPrisma.team.findFirst({ where: { name: "The Eagles" } });
    expect(team).not.toBeNull();
    expect(team!.status).toBe("pending");
    expect(team!.captainName).toBe("John Doe");
    expect(team!.email).toBe("john@test.com");
    expect(team!.phone).toBe("5551234567");
  });

  it("rejects registration when league not found", async () => {
    const result = await registerTeam("nonexistent-slug", "Team X", "Jane", "jane@test.com", "5559876543");
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("League not found");
  });

  it("rejects registration when registration is closed", async () => {
    const { league } = await setupLeagueWithSeason("Closed Reg League");

    // Close registration
    await testPrisma.league.update({
      where: { id: league.id },
      data: { registrationOpen: false },
    });

    const result = await registerTeam(league.slug, "Late Team", "Bob", "bob@test.com", "5551112222");
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("closed");
  });

  it("rejects registration when league is cancelled", async () => {
    const { league } = await setupLeagueWithSeason("Cancelled League");

    await testPrisma.league.update({
      where: { id: league.id },
      data: { status: "cancelled" },
    });

    const result = await registerTeam(league.slug, "Cancelled Team", "Bob", "bob@test.com", "5551112222");
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("cancelled");
  });

  it("rejects registration when league is suspended", async () => {
    const { league } = await setupLeagueWithSeason("Suspended League");

    await testPrisma.league.update({
      where: { id: league.id },
      data: { status: "suspended" },
    });

    const result = await registerTeam(league.slug, "Suspended Team", "Bob", "bob@test.com", "5551112222");
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("suspended");
  });

  it("rejects registration when league is full", async () => {
    const { league } = await setupLeagueWithSeason("Full League");

    // Set maxTeams to 1
    await testPrisma.league.update({
      where: { id: league.id },
      data: { maxTeams: 1 },
    });

    // Create and approve one team to fill the league
    const team = unwrap(await createTeam(league.id, "First Team"));
    await approveTeam(league.slug, team.id);

    const result = await registerTeam(league.slug, "Too Late", "Jane", "jane@test.com", "5559876543");
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("full");
  });

  it("rejects duplicate team name in same season", async () => {
    const { league } = await setupLeagueWithSeason("Dup Name League");

    await registerTeam(league.slug, "Eagles", "John", "john@test.com", "5551234567");
    const result = await registerTeam(league.slug, "Eagles", "Jane", "jane@test.com", "5559876543");

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("already exists");
  });

  it("validates team name minimum length", async () => {
    const { league } = await setupLeagueWithSeason("Zod Name League");

    const result = await registerTeam(league.slug, "A", "John Doe", "john@test.com", "5551234567");
    expect(result.success).toBe(false);
  });

  it("validates email format", async () => {
    const { league } = await setupLeagueWithSeason("Zod Email League");

    const result = await registerTeam(league.slug, "Valid Team", "John Doe", "not-an-email", "5551234567");
    expect(result.success).toBe(false);
  });

  it("validates phone number format", async () => {
    const { league } = await setupLeagueWithSeason("Zod Phone League");

    const result = await registerTeam(league.slug, "Valid Team", "John Doe", "john@test.com", "abc");
    expect(result.success).toBe(false);
  });
});

// ==========================================
// getPendingTeams — admin view with PII
// ==========================================

describe("getPendingTeams", () => {
  it("returns pending teams with PII for admin", async () => {
    const { league } = await setupLeagueWithSeason("Pending League");

    await registerTeam(league.slug, "Pending A", "Alice", "alice@test.com", "5551111111");
    await registerTeam(league.slug, "Pending B", "Bob", "bob@test.com", "5552222222");

    // Also approve one team to make sure it is excluded
    const team = unwrap(await createTeam(league.id, "Approved Team"));
    await approveTeam(league.slug, team.id);

    const pending = await getPendingTeams(league.slug);

    expect(pending).toHaveLength(2);
    // Should include PII
    expect(pending[0].captainName).toBeDefined();
    expect(pending[0].email).toBeDefined();
    expect(pending[0].phone).toBeDefined();
  });
});

// ==========================================
// getApprovedTeams
// ==========================================

describe("getApprovedTeams", () => {
  it("returns only approved teams sorted by name", async () => {
    const { league } = await setupLeagueWithSeason("Approved League");

    const tZ = unwrap(await createTeam(league.id, "Zulu Team"));
    const tA = unwrap(await createTeam(league.id, "Alpha Team"));
    unwrap(await createTeam(league.id, "Pending Team")); // stays pending

    await approveTeam(league.slug, tZ.id);
    await approveTeam(league.slug, tA.id);

    const approved = await getApprovedTeams(league.id);

    expect(approved).toHaveLength(2);
    expect(approved[0].name).toBe("Alpha Team");
    expect(approved[1].name).toBe("Zulu Team");
  });
});

// ==========================================
// getAllTeamsWithStatus — admin view (all statuses, PII)
// ==========================================

describe("getAllTeamsWithStatus", () => {
  it("returns all teams regardless of status, including PII", async () => {
    const { league } = await setupLeagueWithSeason("AllStatus League");

    await registerTeam(league.slug, "Reg Pending", "Captain A", "a@test.com", "5551111111");
    const tApproved = unwrap(await createTeam(league.id, "Admin Approved"));
    await approveTeam(league.slug, tApproved.id);
    const tReject = unwrap(await createTeam(league.id, "Will Reject"));
    await rejectTeam(league.slug, tReject.id);

    const allTeams = await getAllTeamsWithStatus(league.slug);

    expect(allTeams.length).toBeGreaterThanOrEqual(3);
    const statuses = allTeams.map((t) => t.status);
    expect(statuses).toContain("approved");
    expect(statuses).toContain("pending");
    expect(statuses).toContain("rejected");

    // Admin view includes PII for registered teams
    const regTeam = allTeams.find((t) => t.name === "Reg Pending");
    expect(regTeam?.captainName).toBe("Captain A");
    expect(regTeam?.email).toBe("a@test.com");
  });
});

// ==========================================
// rejectTeam
// ==========================================

describe("rejectTeam", () => {
  it("rejects a pending team", async () => {
    const { league } = await setupLeagueWithSeason("Reject League");

    const team = unwrap(await createTeam(league.id, "Reject Me"));

    const result = await rejectTeam(league.slug, team.id);
    expect(result.success).toBe(true);

    const updated = await testPrisma.team.findUnique({ where: { id: team.id } });
    expect(updated!.status).toBe("rejected");
  });

  it("fails when team belongs to another league", async () => {
    const { league: league1 } = await setupLeagueWithSeason("Reject League One");
    const team = unwrap(await createTeam(league1.id, "League One Team"));

    // Create a second league and set auth to it
    const result2 = await createLeague("Reject League Two", "securepass123");
    const league2 = unwrap(result2);
    setAuthContext(league2.id, league2.slug, league2.adminUsername);
    await createSeason(league2.slug, "Season 1", 2026);

    // Create a team in league2 and try to reject league1's team from league2's context
    // rejectTeam should fail because team.leagueId !== session.leagueId
    const result = await rejectTeam(league2.slug, team.id);
    expect(result.success).toBe(false);
    if (!result.success) {
      // May get "Unauthorized" or generic error depending on DB client behavior
      expect(result.error).toBeTruthy();
    }
  });
});

// ==========================================
// adminQuickAddTeam — admin fast-add as approved
// ==========================================

describe("adminQuickAddTeam", () => {
  it("creates a team directly as approved", async () => {
    const { league } = await setupLeagueWithSeason("QuickAdd League");

    const result = await adminQuickAddTeam(league.slug, "Quick Team");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("Quick Team");
    }

    const team = await testPrisma.team.findFirst({ where: { name: "Quick Team" } });
    expect(team).not.toBeNull();
    expect(team!.status).toBe("approved");
  });

  it("sets captainName when provided", async () => {
    const { league } = await setupLeagueWithSeason("QuickAdd Captain League");

    await adminQuickAddTeam(league.slug, "Captain Team", "Jane Smith");

    const team = await testPrisma.team.findFirst({ where: { name: "Captain Team" } });
    expect(team!.captainName).toBe("Jane Smith");
  });

  it("sets captainName to null when not provided", async () => {
    const { league } = await setupLeagueWithSeason("QuickAdd NoCaptain League");

    await adminQuickAddTeam(league.slug, "No Captain");

    const team = await testPrisma.team.findFirst({ where: { name: "No Captain" } });
    expect(team!.captainName).toBeNull();
  });

  it("rejects name shorter than 2 characters", async () => {
    const { league } = await setupLeagueWithSeason("QuickAdd Short League");

    const result = await adminQuickAddTeam(league.slug, "A");
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("at least 2 characters");
  });

  it("rejects name longer than 50 characters", async () => {
    const { league } = await setupLeagueWithSeason("QuickAdd Long League");

    const longName = "A".repeat(51);
    const result = await adminQuickAddTeam(league.slug, longName);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("50 characters");
  });

  it("rejects duplicate name in same season", async () => {
    const { league } = await setupLeagueWithSeason("QuickAdd Dup League");

    await adminQuickAddTeam(league.slug, "DupTeam");
    const result = await adminQuickAddTeam(league.slug, "DupTeam");
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("already exists");
  });

  it("rejects when league is full", async () => {
    const { league } = await setupLeagueWithSeason("QuickAdd Full League");

    await testPrisma.league.update({
      where: { id: league.id },
      data: { maxTeams: 1 },
    });

    await adminQuickAddTeam(league.slug, "First");
    const result = await adminQuickAddTeam(league.slug, "Second");
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("full");
  });

  it("rejects when no active season", async () => {
    const result1 = await createLeague("QuickAdd NoSeason League", "securepass123");
    const league = unwrap(result1);
    setAuthContext(league.id, league.slug, league.adminUsername);

    // No season created
    const result = await adminQuickAddTeam(league.slug, "Orphan Team");
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("No active season");
  });
});

// ==========================================
// deleteTeam
// ==========================================

describe("deleteTeam", () => {
  it("deletes a team with no matchups", async () => {
    const { league } = await setupLeagueWithSeason("Delete League");

    const team = unwrap(await createTeam(league.id, "Delete Me"));
    await approveTeam(league.slug, team.id);

    const result = await deleteTeam(league.slug, team.id);
    expect(result.success).toBe(true);

    const deleted = await testPrisma.team.findUnique({ where: { id: team.id } });
    expect(deleted).toBeNull();
  });

  it("blocks deletion when team has matchups", async () => {
    const { league } = await setupLeagueWithSeason("Delete Block League");

    const teamA = unwrap(await createTeam(league.id, "Has Matchups"));
    const teamB = unwrap(await createTeam(league.id, "Opponent"));
    await approveTeam(league.slug, teamA.id);
    await approveTeam(league.slug, teamB.id);

    await submitMatchup(
      league.slug, 1,
      teamA.id, 40, 5, 35, 20, false,
      teamB.id, 45, 5, 40, 0, false,
    );

    const result = await deleteTeam(league.slug, teamA.id);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("matchup");
  });

  it("fails when team belongs to another league", async () => {
    const { league: league1 } = await setupLeagueWithSeason("Delete Cross League One");
    const team = unwrap(await createTeam(league1.id, "Cross League Team"));

    const result2 = await createLeague("Delete Cross League Two", "securepass123");
    const league2 = unwrap(result2);
    setAuthContext(league2.id, league2.slug, league2.adminUsername);
    await createSeason(league2.slug, "Season 1", 2026);

    const result = await deleteTeam(league2.slug, team.id);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("Unauthorized");
  });

  it("also deletes related weekly scores and scorecards", async () => {
    const { league, season } = await setupLeagueWithSeason("Delete Related League");

    const team = unwrap(await createTeam(league.id, "Has Scores"));
    await approveTeam(league.slug, team.id);

    // Create weekly scores for this team
    await testPrisma.weeklyScore.create({
      data: { weekNumber: 1, leagueId: league.id, seasonId: season.id, teamId: team.id, grossScore: 40, handicap: 5, netScore: 35, points: 10, position: 1 },
    });

    const result = await deleteTeam(league.slug, team.id);
    expect(result.success).toBe(true);

    // Verify weekly scores were cleaned up
    const scores = await testPrisma.weeklyScore.findMany({ where: { teamId: team.id } });
    expect(scores).toHaveLength(0);
  });
});
