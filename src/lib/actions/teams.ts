"use server";

import { z } from "zod";
import { prisma } from "../db";
import { requireAdmin, requireLeagueAdmin } from "../auth";
import { checkRateLimit, RATE_LIMITS } from "../rate-limit";
import { getServerActionIp, type ActionResult } from "./shared";

// ==========================================
// TEAM MANAGEMENT (League-scoped)
// ==========================================

export async function getTeams(leagueId: number) {
  return prisma.team.findMany({
    where: { leagueId, status: "approved" },
    orderBy: { name: "asc" },
  });
}

const createTeamSchema = z.object({
  leagueId: z.number().int().positive(),
  name: z.string().min(2, "Team name must be at least 2 characters").max(50).trim(),
});

export async function createTeam(leagueId: number, name: string) {
  const validated = createTeamSchema.parse({ leagueId, name });

  const session = await requireAdmin();
  if (session.leagueId !== validated.leagueId) {
    throw new Error("Unauthorized: Cannot create team in another league");
  }

  // Get active season
  const activeSeason = await prisma.season.findFirst({
    where: { leagueId: validated.leagueId, isActive: true },
  });

  if (!activeSeason) {
    throw new Error("No active season. Please create a season first.");
  }

  const existing = await prisma.team.findUnique({
    where: { seasonId_name: { seasonId: activeSeason.id, name: validated.name } },
  });
  if (existing) {
    throw new Error(`Team "${validated.name}" already exists in this season`);
  }

  return prisma.team.create({
    data: { name: validated.name, leagueId: validated.leagueId, seasonId: activeSeason.id },
  });
}

export async function getTeamPreviousScores(leagueId: number, teamId: number): Promise<number[]> {
  const matchups = await prisma.matchup.findMany({
    where: {
      leagueId,
      OR: [{ teamAId: teamId }, { teamBId: teamId }],
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
    include: { league: true },
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
    });

    if (!league) {
      return { success: false, error: "League not found" };
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
    console.error("registerTeam error:", error);
    if (error instanceof z.ZodError) {
      return { success: false, error: error.issues[0]?.message || "Invalid input" };
    }
    return { success: false, error: "Registration failed. Please try again." };
  }
}

export async function getPendingTeams(leagueSlug: string) {
  const session = await requireLeagueAdmin(leagueSlug);

  return prisma.team.findMany({
    where: { leagueId: session.leagueId, status: "pending" },
    orderBy: { createdAt: "asc" },
  });
}

export async function getApprovedTeams(leagueId: number) {
  return prisma.team.findMany({
    where: { leagueId, status: "approved" },
    orderBy: { name: "asc" },
  });
}

export async function getAllTeamsWithStatus(leagueSlug: string) {
  const session = await requireLeagueAdmin(leagueSlug);

  return prisma.team.findMany({
    where: { leagueId: session.leagueId },
    orderBy: [{ status: "asc" }, { name: "asc" }],
  });
}

export async function approveTeam(leagueSlug: string, teamId: number): Promise<ActionResult> {
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

    return { success: true, data: undefined };
  } catch (error) {
    console.error("approveTeam error:", error);
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
    console.error("rejectTeam error:", error);
    return { success: false, error: "Failed to reject team. Please try again." };
  }
}

export async function deleteTeam(leagueSlug: string, teamId: number): Promise<ActionResult> {
  try {
    const session = await requireLeagueAdmin(leagueSlug);

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

    await prisma.team.delete({
      where: { id: teamId },
    });

    return { success: true, data: undefined };
  } catch (error) {
    console.error("deleteTeam error:", error);
    return { success: false, error: "Failed to delete team. Please try again." };
  }
}
