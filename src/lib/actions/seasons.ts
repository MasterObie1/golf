"use server";

import { z } from "zod";
import { prisma } from "../db";
import { requireLeagueAdmin } from "../auth";

export interface SeasonInfo {
  id: number;
  name: string;
  year: number;
  seasonNumber: number;
  isActive: boolean;
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
) {
  const validated = createSeasonSchema.parse({ name, year, startDate, endDate, numberOfWeeks });
  const session = await requireLeagueAdmin(leagueSlug);

  // Get the next season number
  const lastSeason = await prisma.season.findFirst({
    where: { leagueId: session.leagueId },
    orderBy: { seasonNumber: "desc" },
  });

  const seasonNumber = lastSeason ? lastSeason.seasonNumber + 1 : 1;

  // Use transaction to ensure deactivate + create are atomic
  const [, newSeason] = await prisma.$transaction([
    prisma.season.updateMany({
      where: { leagueId: session.leagueId },
      data: { isActive: false },
    }),
    prisma.season.create({
      data: {
        leagueId: session.leagueId,
        name: validated.name,
        year: validated.year,
        seasonNumber,
        isActive: true,
        startDate: validated.startDate ?? null,
        endDate: validated.endDate ?? null,
        numberOfWeeks: validated.numberOfWeeks ?? null,
      },
    }),
  ]);

  return newSeason;
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

export async function setActiveSeason(leagueSlug: string, seasonId: number) {
  const session = await requireLeagueAdmin(leagueSlug);

  // Verify the season belongs to this league
  const season = await prisma.season.findUniqueOrThrow({
    where: { id: seasonId },
  });

  if (season.leagueId !== session.leagueId) {
    throw new Error("Unauthorized: Season does not belong to this league");
  }

  // Use transaction to ensure deactivate + activate are atomic
  const [, activatedSeason] = await prisma.$transaction([
    prisma.season.updateMany({
      where: { leagueId: session.leagueId },
      data: { isActive: false },
    }),
    prisma.season.update({
      where: { id: seasonId },
      data: { isActive: true },
    }),
  ]);

  return activatedSeason;
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
) {
  const session = await requireLeagueAdmin(leagueSlug);

  const season = await prisma.season.findUniqueOrThrow({
    where: { id: seasonId },
  });

  if (season.leagueId !== session.leagueId) {
    throw new Error("Unauthorized: Season does not belong to this league");
  }

  return prisma.season.update({
    where: { id: seasonId },
    data,
  });
}

export async function copyTeamsToSeason(
  leagueSlug: string,
  fromSeasonId: number,
  toSeasonId: number
) {
  const session = await requireLeagueAdmin(leagueSlug);

  // Verify both seasons belong to this league
  const [fromSeason, toSeason] = await Promise.all([
    prisma.season.findUniqueOrThrow({ where: { id: fromSeasonId } }),
    prisma.season.findUniqueOrThrow({ where: { id: toSeasonId } }),
  ]);

  if (fromSeason.leagueId !== session.leagueId || toSeason.leagueId !== session.leagueId) {
    throw new Error("Unauthorized: Season does not belong to this league");
  }

  // Get teams from the source season
  const sourceTeams = await prisma.team.findMany({
    where: { seasonId: fromSeasonId, status: "approved" },
  });

  // Create copies in the target season
  const createdTeams = [];
  for (const team of sourceTeams) {
    const newTeam = await prisma.team.create({
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
    });
    createdTeams.push(newTeam);
  }

  return createdTeams;
}
