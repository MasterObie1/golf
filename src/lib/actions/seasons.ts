"use server";

import { z } from "zod";
import { prisma } from "../db";
import { requireLeagueAdmin } from "../auth";
import { logger } from "../logger";
import { requireActiveLeague } from "./leagues";
import type { ActionResult } from "./shared";

export interface SeasonInfo {
  id: number;
  name: string;
  year: number;
  seasonNumber: number;
  isActive: boolean;
  scoringType: string | null;
  startDate: Date | null;
  endDate: Date | null;
  numberOfWeeks: number | null;
  teamCount: number;
  matchupCount: number;
}

const createSeasonSchema = z.object({
  name: z.string().min(2, "Season name must be at least 2 characters").max(100).trim(),
  year: z.number().int().min(2000).max(2100),
  startDate: z.date().nullable().optional(),
  endDate: z.date().nullable().optional(),
  numberOfWeeks: z.number().int().min(1).max(52).nullable().optional(),
});

export async function createSeason(
  leagueSlug: string,
  name: string,
  year: number,
  startDate?: Date | null,
  endDate?: Date | null,
  numberOfWeeks?: number | null
): Promise<ActionResult<{ id: number; name: string; seasonNumber: number; isActive: boolean }>> {
  try {
    const validated = createSeasonSchema.parse({ name, year, startDate, endDate, numberOfWeeks });
    const session = await requireLeagueAdmin(leagueSlug);
    await requireActiveLeague(session.leagueId);

    const league = await prisma.league.findUniqueOrThrow({
      where: { id: session.leagueId },
      select: { scoringType: true },
    });

    // Interactive transaction: read seasonNumber + deactivate + create are atomic
    const newSeason = await prisma.$transaction(async (tx) => {
      const lastSeason = await tx.season.findFirst({
        where: { leagueId: session.leagueId },
        orderBy: { seasonNumber: "desc" },
      });

      const seasonNumber = lastSeason ? lastSeason.seasonNumber + 1 : 1;

      await tx.season.updateMany({
        where: { leagueId: session.leagueId },
        data: { isActive: false },
      });

      return tx.season.create({
        data: {
          leagueId: session.leagueId,
          name: validated.name,
          year: validated.year,
          seasonNumber,
          isActive: true,
          scoringType: league.scoringType,
          startDate: validated.startDate ?? null,
          endDate: validated.endDate ?? null,
          numberOfWeeks: validated.numberOfWeeks ?? null,
        },
      });
    });

    return { success: true, data: { id: newSeason.id, name: newSeason.name, seasonNumber: newSeason.seasonNumber, isActive: newSeason.isActive } };
  } catch (error) {
    logger.error("createSeason failed", error);
    if (error instanceof z.ZodError) {
      return { success: false, error: error.issues[0]?.message || "Invalid input" };
    }
    return { success: false, error: error instanceof Error ? error.message : "Failed to create season" };
  }
}

export async function getSeasons(leagueId: number): Promise<SeasonInfo[]> {
  const seasons = await prisma.season.findMany({
    where: { leagueId },
    include: {
      _count: {
        select: { teams: true, matchups: true },
      },
    },
    orderBy: { seasonNumber: "desc" },
  });

  return seasons.map((s) => ({
    id: s.id,
    name: s.name,
    year: s.year,
    seasonNumber: s.seasonNumber,
    isActive: s.isActive,
    scoringType: s.scoringType,
    startDate: s.startDate,
    endDate: s.endDate,
    numberOfWeeks: s.numberOfWeeks,
    teamCount: s._count.teams,
    matchupCount: s._count.matchups,
  }));
}

export async function getActiveSeason(leagueId: number) {
  return prisma.season.findFirst({
    where: { leagueId, isActive: true },
  });
}

export async function setActiveSeason(leagueSlug: string, seasonId: number): Promise<ActionResult> {
  try {
    const session = await requireLeagueAdmin(leagueSlug);

    // Verify the season belongs to this league
    const season = await prisma.season.findUniqueOrThrow({
      where: { id: seasonId },
    });

    if (season.leagueId !== session.leagueId) {
      return { success: false, error: "Unauthorized: Season does not belong to this league" };
    }

    // Use transaction to ensure deactivate + activate are atomic
    await prisma.$transaction([
      prisma.season.updateMany({
        where: { leagueId: session.leagueId },
        data: { isActive: false },
      }),
      prisma.season.update({
        where: { id: seasonId },
        data: { isActive: true },
      }),
    ]);

    return { success: true, data: undefined };
  } catch (error) {
    logger.error("setActiveSeason failed", error);
    return { success: false, error: error instanceof Error ? error.message : "Failed to set active season" };
  }
}

export async function getSeasonById(seasonId: number) {
  return prisma.season.findUnique({
    where: { id: seasonId },
  });
}

export async function getTeamsForSeason(seasonId: number) {
  return prisma.team.findMany({
    where: { seasonId, status: "approved" },
    orderBy: { name: "asc" },
  });
}

export async function getCurrentWeekNumberForSeason(seasonId: number): Promise<number> {
  const lastMatchup = await prisma.matchup.findFirst({
    where: { seasonId },
    orderBy: { weekNumber: "desc" },
  });
  return lastMatchup ? lastMatchup.weekNumber + 1 : 1;
}

export async function getTeamPreviousScoresForSeason(seasonId: number, teamId: number): Promise<number[]> {
  const matchups = await prisma.matchup.findMany({
    where: {
      seasonId,
      isForfeit: false,
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

const updateSeasonSchema = z.object({
  name: z.string().min(2).max(100).trim().optional(),
  isActive: z.boolean().optional(),
  year: z.number().int().min(2000).max(2100).optional(),
  startDate: z.date().nullable().optional(),
  endDate: z.date().nullable().optional(),
  numberOfWeeks: z.number().int().min(1).max(52).nullable().optional(),
});

export async function updateSeason(
  leagueSlug: string,
  seasonId: number,
  data: {
    name?: string;
    year?: number;
    startDate?: Date | null;
    endDate?: Date | null;
    numberOfWeeks?: number | null;
  }
): Promise<ActionResult> {
  try {
    const validated = updateSeasonSchema.parse(data);
    const session = await requireLeagueAdmin(leagueSlug);

    const season = await prisma.season.findUniqueOrThrow({
      where: { id: seasonId },
    });

    if (season.leagueId !== session.leagueId) {
      return { success: false, error: "Unauthorized: Season does not belong to this league" };
    }

    await prisma.season.update({
      where: { id: seasonId },
      data: validated,
    });

    return { success: true, data: undefined };
  } catch (error) {
    logger.error("updateSeason failed", error);
    return { success: false, error: error instanceof Error ? error.message : "Failed to update season" };
  }
}

export async function copyTeamsToSeason(
  leagueSlug: string,
  fromSeasonId: number,
  toSeasonId: number
): Promise<ActionResult> {
  try {
    const session = await requireLeagueAdmin(leagueSlug);

    // Verify both seasons belong to this league
    const [fromSeason, toSeason] = await Promise.all([
      prisma.season.findUniqueOrThrow({ where: { id: fromSeasonId } }),
      prisma.season.findUniqueOrThrow({ where: { id: toSeasonId } }),
    ]);

    if (fromSeason.leagueId !== session.leagueId || toSeason.leagueId !== session.leagueId) {
      return { success: false, error: "Unauthorized: Season does not belong to this league" };
    }

    // Get teams from the source season
    const sourceTeams = await prisma.team.findMany({
      where: { seasonId: fromSeasonId, status: "approved" },
    });

    // Check for existing teams in target season to prevent duplicates
    const existingTeams = await prisma.team.findMany({
      where: { seasonId: toSeasonId },
      select: { name: true },
    });
    const existingNames = new Set(existingTeams.map((t) => t.name));
    const teamsToCreate = sourceTeams.filter((t) => !existingNames.has(t.name));

    if (teamsToCreate.length === 0) {
      return { success: false, error: "All teams from the source season already exist in the target season." };
    }

    // Create copies in the target season atomically
    await prisma.$transaction(
      teamsToCreate.map((team) =>
        prisma.team.create({
          data: {
            name: team.name,
            leagueId: session.leagueId,
            seasonId: toSeasonId,
            captainName: team.captainName,
            email: team.email,
            phone: team.phone,
            status: "approved", // Pre-approved since they were in previous season
            totalPoints: 0,
            wins: 0,
            losses: 0,
            ties: 0,
          },
        })
      )
    );

    return { success: true, data: undefined };
  } catch (error) {
    logger.error("copyTeamsToSeason failed", error);
    return { success: false, error: error instanceof Error ? error.message : "Failed to copy teams to season" };
  }
}
