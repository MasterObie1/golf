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
import {
  createSeason,
  getSeasons,
  getActiveSeason,
  setActiveSeason,
  getSeasonById,
  getTeamsForSeason,
  getCurrentWeekNumberForSeason,
  getTeamPreviousScoresForSeason,
  updateSeason,
  copyTeamsToSeason,
} from "@/lib/actions/seasons";
import { createTeam, approveTeam } from "@/lib/actions/teams";
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

/**
 * Helper: create a league and set auth context for it.
 * Returns league id, slug, and admin username.
 */
async function setupLeague(name: string) {
  const result = await createLeague(name, "securepass123");
  const league = unwrap(result);
  setAuthContext(league.id, league.slug, league.adminUsername);
  return league;
}

// ==========================================
// Lifecycle
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
// getSeasons
// ==========================================

describe("getSeasons", () => {
  it("returns all seasons ordered by seasonNumber descending", async () => {
    const league = await setupLeague("Seasons List League");
    unwrap(await createSeason(league.slug, "Spring 2025", 2025));
    unwrap(await createSeason(league.slug, "Fall 2025", 2025));
    unwrap(await createSeason(league.slug, "Winter 2026", 2026));

    const seasons = await getSeasons(league.id);

    expect(seasons).toHaveLength(3);
    // Ordered by seasonNumber desc: 3, 2, 1
    expect(seasons[0].seasonNumber).toBe(3);
    expect(seasons[0].name).toBe("Winter 2026");
    expect(seasons[1].seasonNumber).toBe(2);
    expect(seasons[1].name).toBe("Fall 2025");
    expect(seasons[2].seasonNumber).toBe(1);
    expect(seasons[2].name).toBe("Spring 2025");
  });

  it("returns teamCount and matchupCount for each season", async () => {
    const league = await setupLeague("Counts League");
    const s1 = unwrap(await createSeason(league.slug, "Season 1", 2025));

    // Add two teams to season 1
    const tA = unwrap(await createTeam(league.id, "Team A"));
    const tB = unwrap(await createTeam(league.id, "Team B"));
    await approveTeam(league.slug, tA.id);
    await approveTeam(league.slug, tB.id);

    // Submit a matchup in season 1
    await submitMatchup(
      league.slug, 1,
      tA.id, 40, 5, 35, 20, false,
      tB.id, 45, 5, 40, 0, false,
    );

    const seasons = await getSeasons(league.id);
    const season1 = seasons.find((s) => s.id === s1.id);

    expect(season1).toBeDefined();
    expect(season1!.teamCount).toBe(2);
    expect(season1!.matchupCount).toBe(1);
  });

  it("returns empty array for a league with no seasons", async () => {
    const league = await setupLeague("Empty Seasons League");

    const seasons = await getSeasons(league.id);
    expect(seasons).toEqual([]);
  });
});

// ==========================================
// getActiveSeason
// ==========================================

describe("getActiveSeason", () => {
  it("returns the active season", async () => {
    const league = await setupLeague("Active Season League");
    const s1 = unwrap(await createSeason(league.slug, "Season 1", 2025));

    const active = await getActiveSeason(league.id);
    expect(active).not.toBeNull();
    expect(active!.id).toBe(s1.id);
    expect(active!.isActive).toBe(true);
  });

  it("returns the latest created season as active when multiple exist", async () => {
    const league = await setupLeague("Multi Season League");
    unwrap(await createSeason(league.slug, "Season 1", 2025));
    const s2 = unwrap(await createSeason(league.slug, "Season 2", 2025));

    const active = await getActiveSeason(league.id);
    expect(active).not.toBeNull();
    expect(active!.id).toBe(s2.id);
    expect(active!.name).toBe("Season 2");
  });

  it("returns null when no seasons exist", async () => {
    const league = await setupLeague("No Season League");

    const active = await getActiveSeason(league.id);
    expect(active).toBeNull();
  });
});

// ==========================================
// setActiveSeason
// ==========================================

describe("setActiveSeason", () => {
  it("switches the active season", async () => {
    const league = await setupLeague("Switch Active League");
    const s1 = unwrap(await createSeason(league.slug, "Season 1", 2025));
    unwrap(await createSeason(league.slug, "Season 2", 2025));

    // Season 2 is now active. Switch back to season 1.
    const result = await setActiveSeason(league.slug, s1.id);
    expect(result.success).toBe(true);

    const active = await getActiveSeason(league.id);
    expect(active!.id).toBe(s1.id);
  });

  it("deactivates all other seasons when switching", async () => {
    const league = await setupLeague("Deactivate All League");
    const s1 = unwrap(await createSeason(league.slug, "Season 1", 2025));
    const s2 = unwrap(await createSeason(league.slug, "Season 2", 2025));
    const s3 = unwrap(await createSeason(league.slug, "Season 3", 2025));

    // Season 3 is active. Switch to season 1.
    await setActiveSeason(league.slug, s1.id);

    const seasons = await getSeasons(league.id);
    const activeSeasons = seasons.filter((s) => s.isActive);
    expect(activeSeasons).toHaveLength(1);
    expect(activeSeasons[0].id).toBe(s1.id);

    // Verify s2 and s3 are inactive
    const s2Found = seasons.find((s) => s.id === s2.id);
    const s3Found = seasons.find((s) => s.id === s3.id);
    expect(s2Found!.isActive).toBe(false);
    expect(s3Found!.isActive).toBe(false);
  });

  it("rejects setting active season from another league", async () => {
    const league1 = await setupLeague("League One For Active");
    unwrap(await createSeason(league1.slug, "L1 Season", 2025));

    // Create a second league and season
    const league2Result = await createLeague("League Two For Active", "securepass123");
    const league2 = unwrap(league2Result);
    setAuthContext(league2.id, league2.slug, league2.adminUsername);
    const l2Season = unwrap(await createSeason(league2.slug, "L2 Season", 2025));

    // Now switch back to league1 auth and try to activate league2's season
    setAuthContext(league1.id, league1.slug, league1.adminUsername);
    const result = await setActiveSeason(league1.slug, l2Season.id);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("Unauthorized");
    }
  });
});

// ==========================================
// getSeasonById
// ==========================================

describe("getSeasonById", () => {
  it("returns the season by its id", async () => {
    const league = await setupLeague("Season By Id League");
    const s = unwrap(await createSeason(league.slug, "The Season", 2025));

    const season = await getSeasonById(s.id);
    expect(season).not.toBeNull();
    expect(season!.id).toBe(s.id);
    expect(season!.name).toBe("The Season");
    expect(season!.year).toBe(2025);
  });

  it("returns null for a non-existent season id", async () => {
    const season = await getSeasonById(999999);
    expect(season).toBeNull();
  });
});

// ==========================================
// getTeamsForSeason
// ==========================================

describe("getTeamsForSeason", () => {
  it("returns only approved teams for a season", async () => {
    const league = await setupLeague("Teams For Season League");
    const s = unwrap(await createSeason(league.slug, "Season 1", 2025));

    // Create three teams: approve two, leave one pending
    const t1 = unwrap(await createTeam(league.id, "Approved Team 1"));
    const t2 = unwrap(await createTeam(league.id, "Approved Team 2"));
    unwrap(await createTeam(league.id, "Pending Team"));
    await approveTeam(league.slug, t1.id);
    await approveTeam(league.slug, t2.id);
    // "Pending Team" is not approved (createTeam gives "approved" by default — check)
    // Actually createTeam creates with default status; let's verify by checking DB
    // createTeam does NOT set status, so Prisma default is used. Let's create a pending one via registerTeam.

    // Get the season ID to look up teams
    const activeSeason = await getActiveSeason(league.id);
    const teams = await getTeamsForSeason(activeSeason!.id);

    // createTeam + approveTeam gives approved. createTeam without approve might be approved too
    // (from the code: createTeam does not set status field, so Prisma default applies).
    // Actually looking at the Prisma model default — teams default to "approved" status.
    // So we need to manually set one to pending to test filtering.
    const pendingTeam = await testPrisma.team.findFirst({ where: { name: "Pending Team" } });
    await testPrisma.team.update({
      where: { id: pendingTeam!.id },
      data: { status: "pending" },
    });

    const filteredTeams = await getTeamsForSeason(activeSeason!.id);
    const teamNames = filteredTeams.map((t) => t.name);

    expect(filteredTeams).toHaveLength(2);
    expect(teamNames).toContain("Approved Team 1");
    expect(teamNames).toContain("Approved Team 2");
    expect(teamNames).not.toContain("Pending Team");
  });

  it("returns teams ordered by name ascending", async () => {
    const league = await setupLeague("Team Order League");
    unwrap(await createSeason(league.slug, "Season 1", 2025));

    unwrap(await createTeam(league.id, "Zebras"));
    unwrap(await createTeam(league.id, "Alphas"));
    unwrap(await createTeam(league.id, "Mavericks"));

    // Approve all (createTeam + approveTeam)
    const allTeams = await testPrisma.team.findMany({ where: { leagueId: league.id } });
    for (const t of allTeams) {
      await approveTeam(league.slug, t.id);
    }

    const activeSeason = await getActiveSeason(league.id);
    const teams = await getTeamsForSeason(activeSeason!.id);

    expect(teams[0].name).toBe("Alphas");
    expect(teams[1].name).toBe("Mavericks");
    expect(teams[2].name).toBe("Zebras");
  });
});

// ==========================================
// getCurrentWeekNumberForSeason
// ==========================================

describe("getCurrentWeekNumberForSeason", () => {
  it("returns 1 when no matchups exist for the season", async () => {
    const league = await setupLeague("Week Num League");
    const s = unwrap(await createSeason(league.slug, "Season 1", 2025));

    const weekNum = await getCurrentWeekNumberForSeason(s.id);
    expect(weekNum).toBe(1);
  });

  it("returns the next week number after the highest existing matchup week", async () => {
    const league = await setupLeague("Week Incr League");
    const s = unwrap(await createSeason(league.slug, "Season 1", 2025));

    // Create two teams and submit matchups for weeks 1 and 3
    const tA = unwrap(await createTeam(league.id, "Team A"));
    const tB = unwrap(await createTeam(league.id, "Team B"));
    await approveTeam(league.slug, tA.id);
    await approveTeam(league.slug, tB.id);

    await submitMatchup(
      league.slug, 1,
      tA.id, 40, 5, 35, 20, false,
      tB.id, 45, 5, 40, 0, false,
    );
    await submitMatchup(
      league.slug, 3,
      tA.id, 42, 5, 37, 10, false,
      tB.id, 42, 5, 37, 10, false,
    );

    const weekNum = await getCurrentWeekNumberForSeason(s.id);
    expect(weekNum).toBe(4); // highest week is 3, so next is 4
  });
});

// ==========================================
// getTeamPreviousScoresForSeason
// ==========================================

describe("getTeamPreviousScoresForSeason", () => {
  it("returns gross scores from matchups for a team", async () => {
    const league = await setupLeague("Prev Scores League");
    const s = unwrap(await createSeason(league.slug, "Season 1", 2025));

    const tA = unwrap(await createTeam(league.id, "Team A"));
    const tB = unwrap(await createTeam(league.id, "Team B"));
    await approveTeam(league.slug, tA.id);
    await approveTeam(league.slug, tB.id);

    // Week 1: Team A gross = 40
    await submitMatchup(
      league.slug, 1,
      tA.id, 40, 5, 35, 20, false,
      tB.id, 45, 5, 40, 0, false,
    );
    // Week 2: Team A gross = 42
    await submitMatchup(
      league.slug, 2,
      tA.id, 42, 5, 37, 10, false,
      tB.id, 42, 5, 37, 10, false,
    );

    const scores = await getTeamPreviousScoresForSeason(s.id, tA.id);
    expect(scores).toEqual([40, 42]); // ordered by weekNumber asc
  });

  it("returns gross scores when the team is teamB", async () => {
    const league = await setupLeague("Prev Scores B League");
    const s = unwrap(await createSeason(league.slug, "Season 1", 2025));

    const tA = unwrap(await createTeam(league.id, "Team A"));
    const tB = unwrap(await createTeam(league.id, "Team B"));
    await approveTeam(league.slug, tA.id);
    await approveTeam(league.slug, tB.id);

    // Week 1: Team B gross = 45
    await submitMatchup(
      league.slug, 1,
      tA.id, 40, 5, 35, 20, false,
      tB.id, 45, 5, 40, 0, false,
    );

    const scores = await getTeamPreviousScoresForSeason(s.id, tB.id);
    expect(scores).toEqual([45]);
  });

  it("filters out matchups where the team was a sub", async () => {
    const league = await setupLeague("Sub Filter League");
    const s = unwrap(await createSeason(league.slug, "Season 1", 2025));

    const tA = unwrap(await createTeam(league.id, "Team A"));
    const tB = unwrap(await createTeam(league.id, "Team B"));
    const tC = unwrap(await createTeam(league.id, "Team C"));
    await approveTeam(league.slug, tA.id);
    await approveTeam(league.slug, tB.id);
    await approveTeam(league.slug, tC.id);

    // Week 1: Team A plays normally (not a sub) — gross = 40
    await submitMatchup(
      league.slug, 1,
      tA.id, 40, 5, 35, 20, false,
      tB.id, 45, 5, 40, 0, false,
    );

    // Week 2: Team A is a sub (teamAIsSub = true) — gross = 38
    await submitMatchup(
      league.slug, 2,
      tA.id, 38, 5, 33, 20, true,
      tC.id, 48, 5, 43, 0, false,
    );

    const scores = await getTeamPreviousScoresForSeason(s.id, tA.id);
    // Week 2 should be filtered out because teamAIsSub = true
    expect(scores).toEqual([40]);
  });

  it("returns empty array when team has no matchups in the season", async () => {
    const league = await setupLeague("No Matchups League");
    const s = unwrap(await createSeason(league.slug, "Season 1", 2025));

    const tA = unwrap(await createTeam(league.id, "Team A"));
    await approveTeam(league.slug, tA.id);

    const scores = await getTeamPreviousScoresForSeason(s.id, tA.id);
    expect(scores).toEqual([]);
  });
});

// ==========================================
// updateSeason
// ==========================================

describe("updateSeason", () => {
  it("updates the season name", async () => {
    const league = await setupLeague("Update Season League");
    const s = unwrap(await createSeason(league.slug, "Old Name", 2025));

    const result = await updateSeason(league.slug, s.id, { name: "New Name" });
    expect(result.success).toBe(true);

    const updated = await getSeasonById(s.id);
    expect(updated!.name).toBe("New Name");
  });

  it("rejects a name that is too short (Zod validation)", async () => {
    const league = await setupLeague("Update Val League");
    const s = unwrap(await createSeason(league.slug, "Valid Name", 2025));

    const result = await updateSeason(league.slug, s.id, { name: "X" });
    expect(result.success).toBe(false);
  });

  it("rejects updating a season from another league", async () => {
    const league1 = await setupLeague("League One Update");
    unwrap(await createSeason(league1.slug, "L1 Season", 2025));

    const league2Result = await createLeague("League Two Update", "securepass123");
    const league2 = unwrap(league2Result);
    setAuthContext(league2.id, league2.slug, league2.adminUsername);
    const l2Season = unwrap(await createSeason(league2.slug, "L2 Season", 2025));

    // Switch to league1 auth and try to update league2's season
    setAuthContext(league1.id, league1.slug, league1.adminUsername);
    const result = await updateSeason(league1.slug, l2Season.id, { name: "Hacked Name" });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("Unauthorized");
    }
  });
});

// ==========================================
// copyTeamsToSeason
// ==========================================

describe("copyTeamsToSeason", () => {
  it("copies approved teams from one season to another", async () => {
    const league = await setupLeague("Copy Teams League");
    const s1 = unwrap(await createSeason(league.slug, "Season 1", 2025));

    // Create teams in season 1
    const tA = unwrap(await createTeam(league.id, "Alpha"));
    const tB = unwrap(await createTeam(league.id, "Bravo"));
    await approveTeam(league.slug, tA.id);
    await approveTeam(league.slug, tB.id);

    // Create season 2 (this deactivates season 1)
    const s2 = unwrap(await createSeason(league.slug, "Season 2", 2025));

    // Copy teams from season 1 to season 2
    const result = await copyTeamsToSeason(league.slug, s1.id, s2.id);
    expect(result.success).toBe(true);

    // Verify teams exist in season 2
    const s2Teams = await getTeamsForSeason(s2.id);
    const s2Names = s2Teams.map((t) => t.name);

    expect(s2Teams).toHaveLength(2);
    expect(s2Names).toContain("Alpha");
    expect(s2Names).toContain("Bravo");
  });

  it("copied teams have zero stats and approved status", async () => {
    const league = await setupLeague("Copy Stats League");
    const s1 = unwrap(await createSeason(league.slug, "Season 1", 2025));

    const tA = unwrap(await createTeam(league.id, "Alpha"));
    await approveTeam(league.slug, tA.id);

    // Give the team some stats via a matchup
    const tB = unwrap(await createTeam(league.id, "Bravo"));
    await approveTeam(league.slug, tB.id);
    await submitMatchup(
      league.slug, 1,
      tA.id, 40, 5, 35, 20, false,
      tB.id, 45, 5, 40, 0, false,
    );

    // Create season 2 and copy
    const s2 = unwrap(await createSeason(league.slug, "Season 2", 2025));
    await copyTeamsToSeason(league.slug, s1.id, s2.id);

    const s2Teams = await getTeamsForSeason(s2.id);
    for (const team of s2Teams) {
      expect(team.status).toBe("approved");
      expect(team.totalPoints).toBe(0);
      expect(team.wins).toBe(0);
      expect(team.losses).toBe(0);
      expect(team.ties).toBe(0);
    }
  });

  it("skips teams that already exist by name in the target season", async () => {
    const league = await setupLeague("Copy Skip League");
    const s1 = unwrap(await createSeason(league.slug, "Season 1", 2025));

    const tA = unwrap(await createTeam(league.id, "Alpha"));
    const tB = unwrap(await createTeam(league.id, "Bravo"));
    await approveTeam(league.slug, tA.id);
    await approveTeam(league.slug, tB.id);

    // Create season 2 (deactivates season 1) and add "Alpha" manually
    const s2 = unwrap(await createSeason(league.slug, "Season 2", 2025));
    const existingAlpha = unwrap(await createTeam(league.id, "Alpha"));
    await approveTeam(league.slug, existingAlpha.id);

    // Copy teams — "Alpha" should be skipped, only "Bravo" copied
    const result = await copyTeamsToSeason(league.slug, s1.id, s2.id);
    expect(result.success).toBe(true);

    const s2Teams = await getTeamsForSeason(s2.id);
    const s2Names = s2Teams.map((t) => t.name);

    expect(s2Names).toContain("Alpha");
    expect(s2Names).toContain("Bravo");
    // Ensure no duplicate "Alpha"
    const alphaCount = s2Names.filter((n) => n === "Alpha").length;
    expect(alphaCount).toBe(1);
  });

  it("returns error when all teams already exist in target season", async () => {
    const league = await setupLeague("Copy All Exist League");
    const s1 = unwrap(await createSeason(league.slug, "Season 1", 2025));

    const tA = unwrap(await createTeam(league.id, "Alpha"));
    await approveTeam(league.slug, tA.id);

    // Create season 2 with same team name
    const s2 = unwrap(await createSeason(league.slug, "Season 2", 2025));
    unwrap(await createTeam(league.id, "Alpha"));

    const result = await copyTeamsToSeason(league.slug, s1.id, s2.id);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("already exist");
    }
  });

  it("rejects copying when a season does not belong to the league", async () => {
    const league = await setupLeague("Copy Cross League");
    const s1 = unwrap(await createSeason(league.slug, "Season 1", 2025));

    // Create a team in s1 so there's something to copy
    const tA = unwrap(await createTeam(league.id, "Alpha"));
    await approveTeam(league.slug, tA.id);

    // Create season 2 (same league)
    const s2 = unwrap(await createSeason(league.slug, "Season 2", 2025));

    // Create a second league directly in testPrisma and reassign s1 to it
    const otherLeague = await testPrisma.league.create({
      data: {
        name: "Other League",
        slug: "other-league",
        adminUsername: "admin@Other",
        adminPassword: "hashed",
      },
    });

    // Move s1 to the other league
    await testPrisma.season.update({
      where: { id: s1.id },
      data: { leagueId: otherLeague.id },
    });

    // Now try to copy from s1 (belongs to otherLeague) to s2 (belongs to league)
    const result = await copyTeamsToSeason(league.slug, s1.id, s2.id);

    // Should fail — s1 does not belong to this league
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("Unauthorized");
    }
  });
});
