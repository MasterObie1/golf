"use server";

import { z } from "zod";
import { prisma } from "../db";
import { requireAdmin, requireLeagueAdmin } from "../auth";
import { checkRateLimit, RATE_LIMITS } from "../rate-limit";
import { logger } from "../logger";
import { getServerActionIp, type ActionResult } from "./shared";
import { requireActiveLeague } from "./leagues";

// ==========================================
// TEAM MANAGEMENT (League-scoped)
// ==========================================

// Public read — returns approved teams only. No PII fields.
export async function getTeams(leagueId: number) {
  return prisma.team.findMany({
    where: { leagueId, status: "approved" },
    orderBy: { name: "asc" },
    select: {
      id: true,
      leagueId: true,
      seasonId: true,
      name: true,
      status: true,
      totalPoints: true,
      wins: true,
      losses: true,
      ties: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

const createTeamSchema = z.object({
  leagueId: z.number().int().positive(),
  name: z.string().min(2, "Team name must be at least 2 characters").max(50).trim(),
});

export async function createTeam(leagueId: number, name: string): Promise<ActionResult<{ id: number; name: string; leagueId: number; seasonId: number | null }>> {
  try {
    const validated = createTeamSchema.parse({ leagueId, name });

    const session = await requireAdmin();
    if (session.leagueId !== validated.leagueId) {
      return { success: false, error: "Unauthorized: Cannot create team in another league" };
    }
    await requireActiveLeague(session.leagueId);

    // Get active season
    const activeSeason = await prisma.season.findFirst({
      where: { leagueId: validated.leagueId, isActive: true },
    });

    if (!activeSeason) {
      return { success: false, error: "No active season. Please create a season first." };
    }

    const existing = await prisma.team.findUnique({
      where: { seasonId_name: { seasonId: activeSeason.id, name: validated.name } },
    });
    if (existing) {
      return { success: false, error: `Team "${validated.name}" already exists in this season` };
    }

    const team = await prisma.team.create({
      data: { name: validated.name, leagueId: validated.leagueId, seasonId: activeSeason.id },
    });

    return { success: true, data: { id: team.id, name: team.name, leagueId: team.leagueId, seasonId: team.seasonId } };
  } catch (error) {
    logger.error("createTeam failed", error);
    if (error instanceof z.ZodError) {
      return { success: false, error: error.issues[0]?.message || "Invalid input" };
    }
    return { success: false, error: error instanceof Error ? error.message : "Failed to create team" };
  }
}

export async function getTeamPreviousScores(leagueId: number, teamId: number, beforeWeek?: number): Promise<number[]> {
  const matchups = await prisma.matchup.findMany({
    where: {
      leagueId,
      OR: [{ teamAId: teamId }, { teamBId: teamId }],
      ...(beforeWeek ? { weekNumber: { lt: beforeWeek } } : {}),
    },
    orderBy: { weekNumber: "asc" },
  });

  return matchups
    .filter((m) => {
      if (m.teamAId === teamId) return !m.teamAIsSub;
      return !m.teamBIsSub;
    })
    .map((m) => (m.teamAId === teamId ? m.teamAGross : m.teamBGross));
}

/**
 * Get previous gross scores for handicap calculation.
 * For match_play: pulls from Matchup table (existing behavior).
 * For stroke_play/hybrid: pulls from WeeklyScore table.
 */
export async function getTeamPreviousScoresForScoring(
  leagueId: number,
  teamId: number,
  scoringType: string,
  beforeWeek?: number
): Promise<number[]> {
  const validScoringTypes = ["match_play", "stroke_play", "hybrid"];
  if (!validScoringTypes.includes(scoringType)) {
    throw new Error(`Invalid scoring type: ${scoringType}`);
  }

  if (scoringType === "match_play") {
    return getTeamPreviousScores(leagueId, teamId, beforeWeek);
  }

  // Stroke play / hybrid: pull from WeeklyScore
  const scores = await prisma.weeklyScore.findMany({
    where: {
      leagueId,
      teamId,
      isDnp: false,
      isSub: false,
      ...(beforeWeek ? { weekNumber: { lt: beforeWeek } } : {}),
    },
    orderBy: { weekNumber: "asc" },
    select: { grossScore: true },
  });

  return scores.map((s) => s.grossScore);
}

export async function getCurrentWeekNumber(leagueId: number): Promise<number> {
  const lastMatchup = await prisma.matchup.findFirst({
    where: { leagueId },
    orderBy: { weekNumber: "desc" },
  });
  return lastMatchup ? lastMatchup.weekNumber + 1 : 1;
}

export async function getTeamById(teamId: number) {
  return prisma.team.findUnique({
    where: { id: teamId },
    select: {
      id: true,
      leagueId: true,
      seasonId: true,
      name: true,
      status: true,
      totalPoints: true,
      wins: true,
      losses: true,
      ties: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

// ==========================================
// TEAM REGISTRATION
// ==========================================

const registerTeamSchema = z.object({
  name: z.string().min(2).max(50).trim(),
  captainName: z.string().min(2).max(100).trim(),
  email: z.string().email().max(255),
  phone: z.string().min(10).max(20).regex(/^[\d\s()+-]+$/),
});

export async function registerTeam(
  leagueSlug: string,
  name: string,
  captainName: string,
  email: string,
  phone: string
): Promise<ActionResult> {
  try {
    // Rate limit
    const ip = await getServerActionIp();
    const rateCheck = checkRateLimit(`register-team:${ip}`, RATE_LIMITS.registerTeam);
    if (!rateCheck.allowed) {
      return { success: false, error: "Too many registration attempts. Please try again later." };
    }

    const validated = registerTeamSchema.parse({ name, captainName, email, phone });

    const league = await prisma.league.findUnique({
      where: { slug: leagueSlug },
      select: { id: true, status: true, registrationOpen: true, maxTeams: true },
    });

    if (!league) {
      return { success: false, error: "League not found" };
    }

    // Check league status before allowing registration
    if (league.status === "cancelled") {
      return { success: false, error: "This league has been cancelled and is no longer accepting registrations." };
    }
    if (league.status === "suspended") {
      return { success: false, error: "This league is currently suspended. Please contact the league administrator." };
    }

    if (!league.registrationOpen) {
      return { success: false, error: "Registration is currently closed" };
    }

    // Get active season
    const activeSeason = await prisma.season.findFirst({
      where: { leagueId: league.id, isActive: true },
    });

    if (!activeSeason) {
      return { success: false, error: "No active season. The league admin needs to create a season first." };
    }

    const approvedTeamsCount = await prisma.team.count({
      where: { seasonId: activeSeason.id, status: "approved" },
    });

    if (approvedTeamsCount >= league.maxTeams) {
      return { success: false, error: `League is full (${league.maxTeams} teams maximum)` };
    }

    // Check for existing team in the active season
    const existing = await prisma.team.findUnique({
      where: { seasonId_name: { seasonId: activeSeason.id, name: validated.name } },
    });

    if (existing) {
      return { success: false, error: `Team "${validated.name}" already exists in this season` };
    }

    await prisma.team.create({
      data: {
        leagueId: league.id,
        seasonId: activeSeason.id,
        name: validated.name,
        captainName: validated.captainName,
        email: validated.email,
        phone: validated.phone,
        status: "pending",
      },
    });

    return { success: true, data: undefined };
  } catch (error) {
    logger.error("registerTeam failed", error);
    if (error instanceof z.ZodError) {
      return { success: false, error: error.issues[0]?.message || "Invalid input" };
    }
    return { success: false, error: "Registration failed. Please try again." };
  }
}

export async function getPendingTeams(leagueSlug: string) {
  const session = await requireLeagueAdmin(leagueSlug);

  // Admin-only: includes PII (captainName, email, phone) for registration review
  return prisma.team.findMany({
    where: { leagueId: session.leagueId, status: "pending" },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      leagueId: true,
      seasonId: true,
      name: true,
      captainName: true,
      email: true,
      phone: true,
      status: true,
      totalPoints: true,
      wins: true,
      losses: true,
      ties: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

export async function getApprovedTeams(leagueId: number) {
  return prisma.team.findMany({
    where: { leagueId, status: "approved" },
    orderBy: { name: "asc" },
    select: {
      id: true,
      leagueId: true,
      seasonId: true,
      name: true,
      status: true,
      totalPoints: true,
      wins: true,
      losses: true,
      ties: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

export async function getAllTeamsWithStatus(leagueSlug: string) {
  const session = await requireLeagueAdmin(leagueSlug);

  // Admin-only: includes PII (captainName, email, phone) for team management
  return prisma.team.findMany({
    where: { leagueId: session.leagueId },
    orderBy: [{ status: "asc" }, { name: "asc" }],
    select: {
      id: true,
      leagueId: true,
      seasonId: true,
      name: true,
      captainName: true,
      email: true,
      phone: true,
      status: true,
      totalPoints: true,
      wins: true,
      losses: true,
      ties: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

export async function approveTeam(leagueSlug: string, teamId: number): Promise<ActionResult<{ teamId: number; scheduleIntegrationNeeded: boolean } | undefined>> {
  try {
    const session = await requireLeagueAdmin(leagueSlug);

    const team = await prisma.team.findUniqueOrThrow({
      where: { id: teamId },
    });

    if (team.leagueId !== session.leagueId) {
      return { success: false, error: "Unauthorized: Team does not belong to this league" };
    }

    const league = await prisma.league.findUniqueOrThrow({
      where: { id: session.leagueId },
    });

    const approvedCount = await prisma.team.count({
      where: { leagueId: session.leagueId, status: "approved" },
    });

    if (approvedCount >= league.maxTeams) {
      return { success: false, error: `Cannot approve: League is full (${league.maxTeams} teams maximum)` };
    }

    await prisma.team.update({
      where: { id: teamId },
      data: { status: "approved" },
    });

    // Check if a schedule exists for the active season
    const activeSeason = await prisma.season.findFirst({
      where: { leagueId: session.leagueId, isActive: true },
    });

    const hasSchedule = await prisma.scheduledMatchup.count({
      where: {
        leagueId: session.leagueId,
        ...(activeSeason ? { seasonId: activeSeason.id } : {}),
      },
    });

    if (hasSchedule > 0) {
      return { success: true, data: { teamId, scheduleIntegrationNeeded: true } };
    }

    return { success: true, data: undefined };
  } catch (error) {
    logger.error("approveTeam failed", error);
    return { success: false, error: "Failed to approve team. Please try again." };
  }
}

export async function rejectTeam(leagueSlug: string, teamId: number): Promise<ActionResult> {
  try {
    const session = await requireLeagueAdmin(leagueSlug);

    const team = await prisma.team.findUniqueOrThrow({
      where: { id: teamId },
    });

    if (team.leagueId !== session.leagueId) {
      return { success: false, error: "Unauthorized: Team does not belong to this league" };
    }

    await prisma.team.update({
      where: { id: teamId },
      data: { status: "rejected" },
    });

    return { success: true, data: undefined };
  } catch (error) {
    logger.error("rejectTeam failed", error);
    return { success: false, error: "Failed to reject team. Please try again." };
  }
}

export async function updateTeamContact(
  leagueSlug: string,
  teamId: number,
  email?: string | null,
  phone?: string | null
): Promise<ActionResult> {
  try {
    const session = await requireLeagueAdmin(leagueSlug);

    const team = await prisma.team.findFirst({
      where: { id: teamId, leagueId: session.leagueId },
    });
    if (!team) {
      return { success: false, error: "Team not found in this league." };
    }

    // Validate email if provided
    const trimmedEmail = email?.trim() || null;
    if (trimmedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      return { success: false, error: "Invalid email format." };
    }

    // Validate phone if provided: strip non-digits and check 10+ digits
    const trimmedPhone = phone?.trim() || null;
    if (trimmedPhone) {
      const digits = trimmedPhone.replace(/\D/g, "");
      if (digits.length < 10) {
        return { success: false, error: "Phone number must have at least 10 digits." };
      }
    }

    await prisma.team.update({
      where: { id: teamId },
      data: {
        email: trimmedEmail,
        phone: trimmedPhone,
      },
    });

    return { success: true, data: undefined };
  } catch (error) {
    logger.error("updateTeamContact failed", error);
    return { success: false, error: "Failed to update contact info. Please try again." };
  }
}

export async function adminQuickAddTeam(
  leagueSlug: string,
  name: string,
  captainName?: string,
  email?: string,
  phone?: string
): Promise<ActionResult<{ id: number; name: string }>> {
  try {
    const session = await requireLeagueAdmin(leagueSlug);
    await requireActiveLeague(session.leagueId);

    const trimmedName = name?.trim();
    if (!trimmedName || trimmedName.length < 2) {
      return { success: false, error: "Team name must be at least 2 characters" };
    }
    if (trimmedName.length > 50) {
      return { success: false, error: "Team name must be 50 characters or less" };
    }

    // Get active season
    const activeSeason = await prisma.season.findFirst({
      where: { leagueId: session.leagueId, isActive: true },
    });

    if (!activeSeason) {
      return { success: false, error: "No active season. Create a season first." };
    }

    // Check max teams
    const league = await prisma.league.findUniqueOrThrow({
      where: { id: session.leagueId },
      select: { maxTeams: true },
    });

    const approvedCount = await prisma.team.count({
      where: { leagueId: session.leagueId, status: "approved" },
    });

    if (approvedCount >= league.maxTeams) {
      return { success: false, error: `League is full (${league.maxTeams} teams maximum)` };
    }

    // Check for duplicate name in season
    const existing = await prisma.team.findUnique({
      where: { seasonId_name: { seasonId: activeSeason.id, name: trimmedName } },
    });

    if (existing) {
      return { success: false, error: `Team "${trimmedName}" already exists in this season` };
    }

    const team = await prisma.team.create({
      data: {
        name: trimmedName,
        leagueId: session.leagueId,
        seasonId: activeSeason.id,
        captainName: captainName?.trim() || null,
        email: email?.trim() || null,
        phone: phone?.trim() || null,
        status: "approved",
      },
    });

    return { success: true, data: { id: team.id, name: team.name } };
  } catch (error) {
    logger.error("adminQuickAddTeam failed", error);
    return { success: false, error: "Failed to add team. Please try again." };
  }
}

export async function deleteTeam(leagueSlug: string, teamId: number): Promise<ActionResult> {
  try {
    const session = await requireLeagueAdmin(leagueSlug);
    await requireActiveLeague(session.leagueId);

    const team = await prisma.team.findUniqueOrThrow({
      where: { id: teamId },
    });

    if (team.leagueId !== session.leagueId) {
      return { success: false, error: "Unauthorized: Team does not belong to this league" };
    }

    const matchupCount = await prisma.matchup.count({
      where: {
        OR: [{ teamAId: teamId }, { teamBId: teamId }],
      },
    });

    if (matchupCount > 0) {
      return { success: false, error: `Cannot delete team: Team has ${matchupCount} matchup(s) recorded. Delete the matchups first.` };
    }

    // Handle scheduled matchups + delete team atomically
    const league = await prisma.league.findUniqueOrThrow({
      where: { id: session.leagueId },
      select: { midSeasonRemoveAction: true },
    });

    const scheduledCount = await prisma.scheduledMatchup.count({
      where: {
        leagueId: session.leagueId,
        OR: [{ teamAId: teamId }, { teamBId: teamId }],
        status: "scheduled",
      },
    });

    if (scheduledCount > 0) {
      // Convert future scheduled matchups to byes for opponents, then delete team
      const { removeTeamFromSchedule } = await import("./schedule");
      await removeTeamFromSchedule(leagueSlug, teamId, league.midSeasonRemoveAction as "bye_opponents" | "regenerate");
    }

    // Delete related records and team in a transaction
    await prisma.$transaction(async (tx) => {
      // Delete weekly scores for this team
      await tx.weeklyScore.deleteMany({
        where: { teamId },
      });
      // Delete any hole scores for this team's scorecards
      await tx.holeScore.deleteMany({
        where: { scorecard: { teamId } },
      });
      // Delete scorecards for this team
      await tx.scorecard.deleteMany({
        where: { teamId },
      });
      // Clean up any remaining scheduled matchups (including completed ones)
      await tx.scheduledMatchup.deleteMany({
        where: {
          leagueId: session.leagueId,
          OR: [{ teamAId: teamId }, { teamBId: teamId }],
        },
      });
      await tx.team.delete({
        where: { id: teamId },
      });
    });

    return { success: true, data: undefined };
  } catch (error) {
    logger.error("deleteTeam failed", error);
    return { success: false, error: "Failed to delete team. Please try again." };
  }
}
