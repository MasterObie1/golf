"use server";

import { prisma } from "../db";
import { requireLeagueAdmin } from "../auth";
import { logger } from "../logger";
import { requireActiveLeague } from "./leagues";
import { type ActionResult } from "./shared";
import {
  generateScheduleForWeeks,
  validateSchedule,
  type Round,
  type ScheduleResult,
} from "../scheduling/round-robin";
import { getCourseSideForWeek } from "../scheduling/course-side";

// --- Types ---

export interface ScheduleGenerationOptions {
  type: "single_round_robin" | "double_round_robin";
  totalWeeks: number;
  startWeek?: number;
}

export interface ScheduleMatchDetail {
  id: number;
  teamA: { id: number; name: string };
  teamB: { id: number; name: string } | null;
  status: string;
  startingHole: number | null;
  courseSide: string | null;
  matchup?: {
    teamAPoints: number;
    teamBPoints: number;
    teamANet: number;
    teamBNet: number;
  };
}

export interface ScheduleWeek {
  weekNumber: number;
  matches: ScheduleMatchDetail[];
}

export interface ScheduleStatus {
  hasSchedule: boolean;
  scheduleType: string | null;
  totalWeeks: number;
  completedWeeks: number;
  remainingWeeks: number;
  teamCount: number;
}

export interface PreviewResult {
  rounds: Round[];
  truncated: boolean;
  fullRoundsNeeded: number;
}

// --- Generation ---

export async function previewSchedule(
  leagueSlug: string,
  leagueId: number,
  options: ScheduleGenerationOptions
): Promise<ActionResult<PreviewResult>> {
  try {
    await requireLeagueAdmin(leagueSlug);

    // Get approved teams for the active season
    const activeSeason = await prisma.season.findFirst({
      where: { leagueId, isActive: true },
    });

    const teams = await prisma.team.findMany({
      where: {
        leagueId,
        status: "approved",
        ...(activeSeason ? { seasonId: activeSeason.id } : {}),
      },
      select: { id: true },
      orderBy: { id: "asc" },
    });

    if (teams.length < 2) {
      return { success: false, error: "Need at least 2 approved teams to generate a schedule." };
    }

    const teamIds = teams.map((t) => t.id);

    // Reserve playoff weeks
    const league = await prisma.league.findUniqueOrThrow({
      where: { id: leagueId },
      select: { playoffWeeks: true },
    });
    const schedulableWeeks = Math.max(1, options.totalWeeks - league.playoffWeeks);
    const startWeek = options.startWeek ?? 1;
    const isDouble = options.type === "double_round_robin";

    const scheduleResult = generateScheduleForWeeks(teamIds, schedulableWeeks, isDouble, startWeek);

    const validation = validateSchedule(scheduleResult.rounds, teamIds);
    if (!validation.valid) {
      logger.warn("Generated preview schedule has validation errors", { errors: validation.errors });
    }

    return {
      success: true,
      data: {
        rounds: scheduleResult.rounds,
        truncated: scheduleResult.truncated,
        fullRoundsNeeded: scheduleResult.fullRoundsNeeded,
      },
    };
  } catch (error) {
    logger.error("previewSchedule failed", error);
    return { success: false, error: error instanceof Error ? error.message : "Failed to preview schedule." };
  }
}

export async function generateSchedule(
  leagueSlug: string,
  options: ScheduleGenerationOptions
): Promise<ActionResult<{ weeksGenerated: number }>> {
  try {
    const session = await requireLeagueAdmin(leagueSlug);
    await requireActiveLeague(session.leagueId);
    const leagueId = session.leagueId;

    const activeSeason = await prisma.season.findFirst({
      where: { leagueId, isActive: true },
    });

    const teams = await prisma.team.findMany({
      where: {
        leagueId,
        status: "approved",
        ...(activeSeason ? { seasonId: activeSeason.id } : {}),
      },
      select: { id: true },
      orderBy: { id: "asc" },
    });

    if (teams.length < 2) {
      return { success: false, error: "Need at least 2 approved teams to generate a schedule." };
    }

    const teamIds = teams.map((t) => t.id);

    const league = await prisma.league.findUniqueOrThrow({
      where: { id: leagueId },
      select: { playoffWeeks: true, playMode: true, playModeFirstWeekSide: true },
    });
    const schedulableWeeks = Math.max(1, options.totalWeeks - league.playoffWeeks);
    const startWeek = options.startWeek ?? 1;
    const isDouble = options.type === "double_round_robin";

    const scheduleResult = generateScheduleForWeeks(teamIds, schedulableWeeks, isDouble, startWeek);
    const rounds = scheduleResult.rounds;

    const validation = validateSchedule(rounds, teamIds);
    if (!validation.valid) {
      logger.warn("Generated schedule has validation errors", { errors: validation.errors });
    }

    // Build transaction: delete existing scheduled matchups, create new ones, update league
    const operations = [];

    // Delete "scheduled" and "cancelled" (preserve "completed" ones)
    operations.push(
      prisma.scheduledMatchup.deleteMany({
        where: {
          leagueId,
          ...(activeSeason ? { seasonId: activeSeason.id } : {}),
          status: { in: ["scheduled", "cancelled"] },
        },
      })
    );

    for (const round of rounds) {
      const courseSide = getCourseSideForWeek(
        round.weekNumber,
        league.playMode,
        league.playModeFirstWeekSide
      );
      for (const match of round.matches) {
        operations.push(
          prisma.scheduledMatchup.create({
            data: {
              leagueId,
              seasonId: activeSeason?.id ?? null,
              weekNumber: round.weekNumber,
              teamAId: match.teamAId,
              teamBId: match.teamBId,
              status: "scheduled",
              courseSide,
            },
          })
        );
      }
    }

    operations.push(
      prisma.league.update({
        where: { id: leagueId },
        data: { scheduleType: options.type },
      })
    );

    await prisma.$transaction(operations);

    return { success: true, data: { weeksGenerated: rounds.length } };
  } catch (error) {
    logger.error("generateSchedule failed", error);
    return { success: false, error: error instanceof Error ? error.message : "Failed to generate schedule." };
  }
}

export async function clearSchedule(
  leagueSlug: string
): Promise<ActionResult> {
  try {
    const session = await requireLeagueAdmin(leagueSlug);
    await requireActiveLeague(session.leagueId);

    const activeSeason = await prisma.season.findFirst({
      where: { leagueId: session.leagueId, isActive: true },
    });

    await prisma.$transaction([
      prisma.scheduledMatchup.deleteMany({
        where: {
          leagueId: session.leagueId,
          ...(activeSeason ? { seasonId: activeSeason.id } : {}),
          status: { in: ["scheduled", "cancelled"] },
        },
      }),
      prisma.league.update({
        where: { id: session.leagueId },
        data: { scheduleType: null },
      }),
    ]);

    return { success: true, data: undefined };
  } catch (error) {
    logger.error("clearSchedule failed", error);
    return { success: false, error: error instanceof Error ? error.message : "Failed to clear schedule." };
  }
}

// --- Retrieval ---

export async function getSchedule(
  leagueId: number,
  seasonId?: number
): Promise<ScheduleWeek[]> {
  const matchups = await prisma.scheduledMatchup.findMany({
    where: {
      leagueId,
      ...(seasonId ? { seasonId } : {}),
    },
    include: {
      teamA: { select: { id: true, name: true } },
      teamB: { select: { id: true, name: true } },
      matchup: {
        select: {
          teamAPoints: true,
          teamBPoints: true,
          teamANet: true,
          teamBNet: true,
        },
      },
    },
    orderBy: [{ weekNumber: "asc" }, { id: "asc" }],
  });

  const weekMap = new Map<number, ScheduleMatchDetail[]>();

  for (const m of matchups) {
    const week = weekMap.get(m.weekNumber) || [];
    week.push({
      id: m.id,
      teamA: m.teamA,
      teamB: m.teamB,
      status: m.status,
      startingHole: m.startingHole,
      courseSide: m.courseSide,
      matchup: m.matchup ?? undefined,
    });
    weekMap.set(m.weekNumber, week);
  }

  return [...weekMap.entries()]
    .sort(([a], [b]) => a - b)
    .map(([weekNumber, matches]) => ({ weekNumber, matches }));
}

export async function getScheduleForWeek(
  leagueId: number,
  weekNumber: number
): Promise<ScheduleMatchDetail[]> {
  const matchups = await prisma.scheduledMatchup.findMany({
    where: { leagueId, weekNumber },
    include: {
      teamA: { select: { id: true, name: true } },
      teamB: { select: { id: true, name: true } },
      matchup: {
        select: {
          teamAPoints: true,
          teamBPoints: true,
          teamANet: true,
          teamBNet: true,
        },
      },
    },
    orderBy: { id: "asc" },
  });

  return matchups.map((m) => ({
    id: m.id,
    teamA: m.teamA,
    teamB: m.teamB,
    status: m.status,
    startingHole: m.startingHole,
    courseSide: m.courseSide,
    matchup: m.matchup ?? undefined,
  }));
}

export async function getTeamSchedule(
  leagueId: number,
  teamId: number
): Promise<ScheduleWeek[]> {
  const matchups = await prisma.scheduledMatchup.findMany({
    where: {
      leagueId,
      OR: [{ teamAId: teamId }, { teamBId: teamId }],
    },
    include: {
      teamA: { select: { id: true, name: true } },
      teamB: { select: { id: true, name: true } },
      matchup: {
        select: {
          teamAPoints: true,
          teamBPoints: true,
          teamANet: true,
          teamBNet: true,
        },
      },
    },
    orderBy: [{ weekNumber: "asc" }, { id: "asc" }],
  });

  const weekMap = new Map<number, ScheduleMatchDetail[]>();
  for (const m of matchups) {
    const week = weekMap.get(m.weekNumber) || [];
    week.push({
      id: m.id,
      teamA: m.teamA,
      teamB: m.teamB,
      status: m.status,
      startingHole: m.startingHole,
      courseSide: m.courseSide,
      matchup: m.matchup ?? undefined,
    });
    weekMap.set(m.weekNumber, week);
  }

  return [...weekMap.entries()]
    .sort(([a], [b]) => a - b)
    .map(([weekNumber, matches]) => ({ weekNumber, matches }));
}

export async function getScheduleStatus(
  leagueId: number,
  seasonId?: number
): Promise<ScheduleStatus> {
  const league = await prisma.league.findUniqueOrThrow({
    where: { id: leagueId },
    select: { scheduleType: true },
  });

  const allMatchups = await prisma.scheduledMatchup.findMany({
    where: {
      leagueId,
      ...(seasonId ? { seasonId } : {}),
    },
    select: { weekNumber: true, status: true },
  });

  const weeks = new Set(allMatchups.map((m) => m.weekNumber));
  const completedWeeks = new Set(
    allMatchups.filter((m) => m.status === "completed").map((m) => m.weekNumber)
  );

  const teamCount = await prisma.team.count({
    where: {
      leagueId,
      status: "approved",
      ...(seasonId ? { seasonId } : {}),
    },
  });

  return {
    hasSchedule: allMatchups.length > 0,
    scheduleType: league.scheduleType,
    totalWeeks: weeks.size,
    completedWeeks: completedWeeks.size,
    remainingWeeks: weeks.size - completedWeeks.size,
    teamCount,
  };
}

// --- Modification ---

export async function swapTeamsInMatchup(
  leagueSlug: string,
  scheduledMatchupId: number,
  newTeamAId: number,
  newTeamBId: number | null
): Promise<ActionResult> {
  try {
    const session = await requireLeagueAdmin(leagueSlug);
    await requireActiveLeague(session.leagueId);

    // Validate that team IDs belong to this league
    const teamIdsToValidate = [newTeamAId, ...(newTeamBId != null ? [newTeamBId] : [])];
    const validTeams = await prisma.team.findMany({
      where: { id: { in: teamIdsToValidate }, leagueId: session.leagueId },
      select: { id: true },
    });
    const validTeamIds = new Set(validTeams.map(t => t.id));
    if (!validTeamIds.has(newTeamAId) || (newTeamBId != null && !validTeamIds.has(newTeamBId))) {
      return { success: false, error: "One or more teams do not belong to this league." };
    }

    const existing = await prisma.scheduledMatchup.findUnique({
      where: { id: scheduledMatchupId },
    });

    if (!existing || existing.leagueId !== session.leagueId) {
      return { success: false, error: "Scheduled matchup not found." };
    }
    if (existing.status !== "scheduled") {
      return { success: false, error: "Can only modify scheduled (unplayed) matchups." };
    }

    // Conflict check + update atomically to prevent TOCTOU race
    const newTeamIds = [newTeamAId, ...(newTeamBId != null ? [newTeamBId] : [])];

    await prisma.$transaction(async (tx) => {
      const conflicts = await tx.scheduledMatchup.findMany({
        where: {
          leagueId: session.leagueId,
          weekNumber: existing.weekNumber,
          id: { not: scheduledMatchupId },
          status: { not: "cancelled" },
          OR: newTeamIds.flatMap((tid) => [
            { teamAId: tid },
            { teamBId: tid },
          ]),
        },
      });

      if (conflicts.length > 0) {
        throw new Error("One or more teams already have a matchup in that week.");
      }

      await tx.scheduledMatchup.update({
        where: { id: scheduledMatchupId },
        data: { teamAId: newTeamAId, teamBId: newTeamBId },
      });
    });

    return { success: true, data: undefined };
  } catch (error) {
    logger.error("swapTeamsInMatchup failed", error);
    return { success: false, error: error instanceof Error ? error.message : "Failed to swap teams." };
  }
}

export async function cancelScheduledMatchup(
  leagueSlug: string,
  scheduledMatchupId: number
): Promise<ActionResult> {
  try {
    const session = await requireLeagueAdmin(leagueSlug);
    await requireActiveLeague(session.leagueId);

    const existing = await prisma.scheduledMatchup.findUnique({
      where: { id: scheduledMatchupId },
    });

    if (!existing || existing.leagueId !== session.leagueId) {
      return { success: false, error: "Scheduled matchup not found." };
    }
    if (existing.status !== "scheduled") {
      return { success: false, error: "Can only cancel scheduled (unplayed) matchups." };
    }

    await prisma.scheduledMatchup.update({
      where: { id: scheduledMatchupId },
      data: { status: "cancelled" },
    });

    return { success: true, data: undefined };
  } catch (error) {
    logger.error("cancelScheduledMatchup failed", error);
    return { success: false, error: error instanceof Error ? error.message : "Failed to cancel matchup." };
  }
}

export async function rescheduleMatchup(
  leagueSlug: string,
  scheduledMatchupId: number,
  newWeekNumber: number
): Promise<ActionResult> {
  try {
    const session = await requireLeagueAdmin(leagueSlug);
    await requireActiveLeague(session.leagueId);

    const existing = await prisma.scheduledMatchup.findUnique({
      where: { id: scheduledMatchupId },
    });

    if (!existing || existing.leagueId !== session.leagueId) {
      return { success: false, error: "Scheduled matchup not found." };
    }
    if (existing.status !== "scheduled") {
      return { success: false, error: "Can only reschedule unplayed matchups." };
    }

    // Check for conflicts + update atomically to prevent TOCTOU race
    await prisma.$transaction(async (tx) => {
      const conflicts = await tx.scheduledMatchup.findMany({
        where: {
          leagueId: session.leagueId,
          weekNumber: newWeekNumber,
          status: { not: "cancelled" },
          OR: [
            { teamAId: existing.teamAId },
            { teamBId: existing.teamAId },
            ...(existing.teamBId
              ? [{ teamAId: existing.teamBId }, { teamBId: existing.teamBId }]
              : []),
          ],
        },
      });

      if (conflicts.length > 0) {
        throw new Error(`One or more teams already have a matchup in Week ${newWeekNumber}.`);
      }

      await tx.scheduledMatchup.update({
        where: { id: scheduledMatchupId },
        data: { weekNumber: newWeekNumber },
      });
    });

    return { success: true, data: undefined };
  } catch (error) {
    logger.error("rescheduleMatchup failed", error);
    return { success: false, error: error instanceof Error ? error.message : "Failed to reschedule matchup." };
  }
}

export async function addManualScheduledMatchup(
  leagueSlug: string,
  weekNumber: number,
  teamAId: number,
  teamBId: number | null
): Promise<ActionResult> {
  try {
    const session = await requireLeagueAdmin(leagueSlug);
    await requireActiveLeague(session.leagueId);

    // Validate that team IDs belong to this league
    const validTeams = await prisma.team.findMany({
      where: { id: { in: [teamAId, teamBId].filter((id): id is number => id != null) }, leagueId: session.leagueId },
      select: { id: true },
    });
    const validTeamIds = new Set(validTeams.map(t => t.id));
    if (!validTeamIds.has(teamAId) || (teamBId != null && !validTeamIds.has(teamBId))) {
      return { success: false, error: "One or more teams do not belong to this league." };
    }

    const activeSeason = await prisma.season.findFirst({
      where: { leagueId: session.leagueId, isActive: true },
    });

    // Check conflicts + create atomically to prevent TOCTOU race
    const teamIdsToCheck = [teamAId, ...(teamBId ? [teamBId] : [])];

    await prisma.$transaction(async (tx) => {
      const conflicts = await tx.scheduledMatchup.findMany({
        where: {
          leagueId: session.leagueId,
          weekNumber,
          status: { not: "cancelled" },
          OR: teamIdsToCheck.flatMap((tid) => [
            { teamAId: tid },
            { teamBId: tid },
          ]),
        },
        include: { teamA: { select: { name: true } }, teamB: { select: { name: true } } },
      });

      if (conflicts.length > 0) {
        // Find which team has the conflict
        for (const tid of teamIdsToCheck) {
          const hasConflict = conflicts.some(
            (c) => c.teamAId === tid || c.teamBId === tid
          );
          if (hasConflict) {
            const team = await tx.team.findUnique({ where: { id: tid }, select: { name: true } });
            throw new Error(`${team?.name || "Team"} already has a matchup in Week ${weekNumber}.`);
          }
        }
      }

      await tx.scheduledMatchup.create({
        data: {
          leagueId: session.leagueId,
          seasonId: activeSeason?.id ?? null,
          weekNumber,
          teamAId,
          teamBId,
          status: "scheduled",
        },
      });
    });

    return { success: true, data: undefined };
  } catch (error) {
    logger.error("addManualScheduledMatchup failed", error);
    return { success: false, error: error instanceof Error ? error.message : "Failed to add matchup." };
  }
}

// --- Bye Week Points ---

export async function processByeWeekPoints(
  leagueSlug: string,
  weekNumber: number
): Promise<ActionResult> {
  try {
    const session = await requireLeagueAdmin(leagueSlug);

    const league = await prisma.league.findUniqueOrThrow({
      where: { id: session.leagueId },
      select: { byePointsMode: true, byePointsFlat: true },
    });

    // Find bye entries for this week (teamBId is null, only scheduled — not already completed)
    const byeEntries = await prisma.scheduledMatchup.findMany({
      where: {
        leagueId: session.leagueId,
        weekNumber,
        teamBId: null,
        status: "scheduled",
      },
    });

    if (byeEntries.length === 0) {
      return { success: true, data: undefined };
    }

    const operations = [];

    // Pre-compute league average once (outside the loop) to avoid N+1 queries
    let leagueAvgPoints = 0;
    if (league.byePointsMode === "league_average") {
      const weekMatchups = await prisma.matchup.findMany({
        where: { leagueId: session.leagueId, weekNumber },
        select: { teamAPoints: true, teamBPoints: true },
      });
      if (weekMatchups.length > 0) {
        const totalPts = weekMatchups.reduce(
          (sum, m) => sum + m.teamAPoints + m.teamBPoints,
          0
        );
        leagueAvgPoints = Math.round((totalPts / (weekMatchups.length * 2)) * 10) / 10;
      }
    }

    // Pre-compute team averages in batch (outside the loop) to avoid N+1 queries
    const teamAvgMap = new Map<number, number>();
    if (league.byePointsMode === "team_average") {
      const byeTeamIds = byeEntries.map((b) => b.teamAId);
      const allTeamMatchups = await prisma.matchup.findMany({
        where: {
          leagueId: session.leagueId,
          OR: byeTeamIds.flatMap((tid) => [
            { teamAId: tid },
            { teamBId: tid },
          ]),
        },
        select: { teamAId: true, teamBId: true, teamAPoints: true, teamBPoints: true },
      });
      for (const tid of byeTeamIds) {
        const teamMatchups = allTeamMatchups.filter(
          (m) => m.teamAId === tid || m.teamBId === tid
        );
        if (teamMatchups.length > 0) {
          const teamPts = teamMatchups.reduce((sum, m) => {
            return sum + (m.teamAId === tid ? m.teamAPoints : m.teamBPoints);
          }, 0);
          teamAvgMap.set(tid, Math.round((teamPts / teamMatchups.length) * 10) / 10);
        }
      }
    }

    for (const bye of byeEntries) {
      let points = 0;

      switch (league.byePointsMode) {
        case "zero":
          points = 0;
          break;
        case "flat":
          points = league.byePointsFlat;
          break;
        case "league_average":
          points = leagueAvgPoints;
          break;
        case "team_average":
          points = teamAvgMap.get(bye.teamAId) ?? 0;
          break;
      }

      if (points > 0) {
        operations.push(
          prisma.team.update({
            where: { id: bye.teamAId },
            data: { totalPoints: { increment: points } },
          })
        );
      }

      // Mark bye as completed
      operations.push(
        prisma.scheduledMatchup.update({
          where: { id: bye.id },
          data: { status: "completed" },
        })
      );
    }

    if (operations.length > 0) {
      await prisma.$transaction(operations);
    }

    return { success: true, data: undefined };
  } catch (error) {
    logger.error("processByeWeekPoints failed", error);
    return { success: false, error: error instanceof Error ? error.message : "Failed to process bye points." };
  }
}

// --- Mid-Season Team Addition ---

export type AddTeamStrategy = "start_from_here" | "fill_byes" | "pro_rate" | "catch_up";

export async function addTeamToSchedule(
  leagueSlug: string,
  teamId: number,
  strategy: AddTeamStrategy
): Promise<ActionResult> {
  try {
    const session = await requireLeagueAdmin(leagueSlug);
    const leagueId = session.leagueId;

    const activeSeason = await prisma.season.findFirst({
      where: { leagueId, isActive: true },
    });

    const league = await prisma.league.findUniqueOrThrow({
      where: { id: leagueId },
      select: { playoffWeeks: true, scheduleType: true, playMode: true, playModeFirstWeekSide: true },
    });

    // Get current week (latest completed matchup week + 1, or latest scheduled week)
    const lastCompletedMatchup = await prisma.matchup.findFirst({
      where: { leagueId },
      orderBy: { weekNumber: "desc" },
      select: { weekNumber: true },
    });
    const currentWeek = lastCompletedMatchup ? lastCompletedMatchup.weekNumber + 1 : 1;

    // Get all approved teams including the new one
    const allTeams = await prisma.team.findMany({
      where: {
        leagueId,
        status: "approved",
        ...(activeSeason ? { seasonId: activeSeason.id } : {}),
      },
      select: { id: true },
      orderBy: { id: "asc" },
    });

    const allTeamIds = allTeams.map((t) => t.id);

    if (strategy === "fill_byes") {
      // Only works when going from odd to even (byes exist)
      const futureByeEntries = await prisma.scheduledMatchup.findMany({
        where: {
          leagueId,
          ...(activeSeason ? { seasonId: activeSeason.id } : {}),
          weekNumber: { gte: currentWeek },
          teamBId: null,
          status: "scheduled",
        },
        orderBy: { weekNumber: "asc" },
      });

      if (futureByeEntries.length === 0) {
        return { success: false, error: "No bye slots available to fill." };
      }

      const operations = [];
      for (const bye of futureByeEntries) {
        operations.push(
          prisma.scheduledMatchup.update({
            where: { id: bye.id },
            data: { teamBId: teamId },
          })
        );
      }

      await prisma.$transaction(operations);
      return { success: true, data: undefined };
    }

    // For "start_from_here", "pro_rate", "catch_up": regenerate future schedule
    const totalScheduledWeeks = await prisma.scheduledMatchup.findMany({
      where: {
        leagueId,
        ...(activeSeason ? { seasonId: activeSeason.id } : {}),
      },
      select: { weekNumber: true },
      distinct: ["weekNumber"],
    });

    const maxWeek = totalScheduledWeeks.length > 0
      ? Math.max(...totalScheduledWeeks.map((w) => w.weekNumber))
      : currentWeek + allTeamIds.length - 1;

    const remainingWeeks = maxWeek - currentWeek + 1;
    if (remainingWeeks <= 0) {
      return { success: false, error: "No remaining weeks in the schedule to modify." };
    }

    const isDouble = league.scheduleType === "double_round_robin";
    const rounds = generateScheduleForWeeks(allTeamIds, remainingWeeks, isDouble, currentWeek).rounds;

    // Delete future scheduled/cancelled matchups + insert new schedule atomically
    await prisma.$transaction(async (tx) => {
      await tx.scheduledMatchup.deleteMany({
        where: {
          leagueId,
          ...(activeSeason ? { seasonId: activeSeason.id } : {}),
          weekNumber: { gte: currentWeek },
          status: { in: ["scheduled", "cancelled"] },
        },
      });

      for (const round of rounds) {
        const roundCourseSide = getCourseSideForWeek(
          round.weekNumber,
          league.playMode,
          league.playModeFirstWeekSide
        );
        for (const match of round.matches) {
          await tx.scheduledMatchup.create({
            data: {
              leagueId,
              seasonId: activeSeason?.id ?? null,
              weekNumber: round.weekNumber,
              teamAId: match.teamAId,
              teamBId: match.teamBId,
              status: "scheduled",
              courseSide: roundCourseSide,
            },
          });
        }
      }

      // Strategy-specific extras (inside transaction for atomicity)
      if (strategy === "pro_rate") {
        await tx.league.update({
          where: { id: leagueId },
          data: { strokePlayProRate: true },
        });
      }
    });

    return { success: true, data: undefined };
  } catch (error) {
    logger.error("addTeamToSchedule failed", error);
    return { success: false, error: error instanceof Error ? error.message : "Failed to add team to schedule." };
  }
}

// --- Mid-Season Team Removal ---

export type RemoveTeamAction = "bye_opponents" | "regenerate";

export async function removeTeamFromSchedule(
  leagueSlug: string,
  teamId: number,
  action: RemoveTeamAction
): Promise<ActionResult> {
  try {
    if (action !== "bye_opponents" && action !== "regenerate") {
      return { success: false, error: `Invalid action: ${action}. Must be "bye_opponents" or "regenerate".` };
    }

    const session = await requireLeagueAdmin(leagueSlug);
    const leagueId = session.leagueId;

    const activeSeason = await prisma.season.findFirst({
      where: { leagueId, isActive: true },
    });

    // Get current week
    const lastCompletedMatchup = await prisma.matchup.findFirst({
      where: { leagueId },
      orderBy: { weekNumber: "desc" },
      select: { weekNumber: true },
    });
    const currentWeek = lastCompletedMatchup ? lastCompletedMatchup.weekNumber + 1 : 1;

    if (action === "regenerate") {
      // Get remaining teams (excluding the removed one)
      const remainingTeams = await prisma.team.findMany({
        where: {
          leagueId,
          status: "approved",
          id: { not: teamId },
          ...(activeSeason ? { seasonId: activeSeason.id } : {}),
        },
        select: { id: true },
        orderBy: { id: "asc" },
      });

      const league = await prisma.league.findUniqueOrThrow({
        where: { id: leagueId },
        select: { scheduleType: true, playMode: true, playModeFirstWeekSide: true },
      });

      const totalScheduledWeeks = await prisma.scheduledMatchup.findMany({
        where: {
          leagueId,
          ...(activeSeason ? { seasonId: activeSeason.id } : {}),
        },
        select: { weekNumber: true },
        distinct: ["weekNumber"],
      });

      const maxWeek = totalScheduledWeeks.length > 0
        ? Math.max(...totalScheduledWeeks.map((w) => w.weekNumber))
        : currentWeek;

      const remainingWeeks = maxWeek - currentWeek + 1;

      // Delete future scheduled/cancelled matchups + insert new schedule atomically
      const isDouble = league.scheduleType === "double_round_robin";
      const rounds = remainingTeams.length >= 2 && remainingWeeks > 0
        ? generateScheduleForWeeks(
            remainingTeams.map((t) => t.id),
            remainingWeeks,
            isDouble,
            currentWeek
          ).rounds
        : [];

      await prisma.$transaction(async (tx) => {
        await tx.scheduledMatchup.deleteMany({
          where: {
            leagueId,
            ...(activeSeason ? { seasonId: activeSeason.id } : {}),
            weekNumber: { gte: currentWeek },
            status: { in: ["scheduled", "cancelled"] },
          },
        });

        for (const round of rounds) {
          const roundCourseSide = getCourseSideForWeek(
            round.weekNumber,
            league.playMode,
            league.playModeFirstWeekSide
          );
          for (const match of round.matches) {
            await tx.scheduledMatchup.create({
              data: {
                leagueId,
                seasonId: activeSeason?.id ?? null,
                weekNumber: round.weekNumber,
                teamAId: match.teamAId,
                teamBId: match.teamBId,
                status: "scheduled",
                courseSide: roundCourseSide,
              },
            });
          }
        }
      });
    } else {
      // Default: "bye_opponents" — convert future matchups to byes
      const futureMatchups = await prisma.scheduledMatchup.findMany({
        where: {
          leagueId,
          weekNumber: { gte: currentWeek },
          status: "scheduled",
          OR: [{ teamAId: teamId }, { teamBId: teamId }],
        },
      });

      const operations = [];
      for (const m of futureMatchups) {
        if (m.teamAId === teamId && m.teamBId !== null) {
          // Swap: opponent becomes teamA with a bye
          operations.push(
            prisma.scheduledMatchup.update({
              where: { id: m.id },
              data: { teamAId: m.teamBId, teamBId: null },
            })
          );
        } else if (m.teamBId === teamId) {
          // teamA stays, teamB becomes null (bye)
          operations.push(
            prisma.scheduledMatchup.update({
              where: { id: m.id },
              data: { teamBId: null },
            })
          );
        } else {
          // teamA is the removed team and teamB is null — cancel it
          operations.push(
            prisma.scheduledMatchup.update({
              where: { id: m.id },
              data: { status: "cancelled" },
            })
          );
        }
      }

      if (operations.length > 0) {
        await prisma.$transaction(operations);
      }
    }

    return { success: true, data: undefined };
  } catch (error) {
    logger.error("removeTeamFromSchedule failed", error);
    return { success: false, error: error instanceof Error ? error.message : "Failed to remove team from schedule." };
  }
}

// --- Shotgun Start & Course Side ---

export async function updateMatchupStartingHole(
  leagueSlug: string,
  scheduledMatchupId: number,
  startingHole: number | null
): Promise<ActionResult> {
  try {
    const session = await requireLeagueAdmin(leagueSlug);

    const matchup = await prisma.scheduledMatchup.findUnique({
      where: { id: scheduledMatchupId },
    });

    if (!matchup || matchup.leagueId !== session.leagueId) {
      return { success: false, error: "Scheduled matchup not found." };
    }
    if (matchup.status !== "scheduled") {
      return { success: false, error: "Can only modify scheduled (unplayed) matchups." };
    }

    if (startingHole !== null) {
      // Validate hole range based on courseSide
      if (matchup.courseSide === "front" && (startingHole < 1 || startingHole > 9)) {
        return { success: false, error: "Starting hole must be 1-9 for front nine." };
      }
      if (matchup.courseSide === "back" && (startingHole < 10 || startingHole > 18)) {
        return { success: false, error: "Starting hole must be 10-18 for back nine." };
      }
      if (!matchup.courseSide && (startingHole < 1 || startingHole > 18)) {
        return { success: false, error: "Starting hole must be 1-18." };
      }
    }

    await prisma.scheduledMatchup.update({
      where: { id: scheduledMatchupId },
      data: { startingHole },
    });

    return { success: true, data: undefined };
  } catch (error) {
    logger.error("updateMatchupStartingHole failed", error);
    return { success: false, error: error instanceof Error ? error.message : "Failed to update starting hole." };
  }
}

export async function updateWeekCourseSide(
  leagueSlug: string,
  weekNumber: number,
  courseSide: string | null
): Promise<ActionResult> {
  try {
    const session = await requireLeagueAdmin(leagueSlug);

    if (courseSide !== null && courseSide !== "front" && courseSide !== "back") {
      return { success: false, error: "Course side must be 'front', 'back', or null." };
    }

    const result = await prisma.scheduledMatchup.updateMany({
      where: {
        leagueId: session.leagueId,
        weekNumber,
        status: "scheduled",
      },
      data: { courseSide },
    });

    if (result.count === 0) {
      return { success: false, error: "No scheduled matchups found for that week." };
    }

    return { success: true, data: undefined };
  } catch (error) {
    logger.error("updateWeekCourseSide failed", error);
    return { success: false, error: error instanceof Error ? error.message : "Failed to update course side." };
  }
}

export async function assignShotgunStartingHoles(
  leagueSlug: string,
  assignments: Array<{ matchupId: number; startingHole: number }>
): Promise<ActionResult> {
  try {
    const session = await requireLeagueAdmin(leagueSlug);

    if (assignments.length === 0) {
      return { success: false, error: "No assignments provided." };
    }

    // Validate all matchups exist and belong to this league
    const matchupIds = assignments.map((a) => a.matchupId);
    const matchups = await prisma.scheduledMatchup.findMany({
      where: { id: { in: matchupIds }, leagueId: session.leagueId },
    });

    if (matchups.length !== assignments.length) {
      return { success: false, error: "One or more matchups not found in this league." };
    }

    for (const m of matchups) {
      if (m.status !== "scheduled") {
        return { success: false, error: "Can only assign starting holes to scheduled matchups." };
      }
    }

    // Validate hole ranges
    const matchupMap = new Map(matchups.map((m) => [m.id, m]));
    for (const a of assignments) {
      const m = matchupMap.get(a.matchupId)!;
      if (m.courseSide === "front" && (a.startingHole < 1 || a.startingHole > 9)) {
        return { success: false, error: `Starting hole ${a.startingHole} is out of range for front nine (1-9).` };
      }
      if (m.courseSide === "back" && (a.startingHole < 10 || a.startingHole > 18)) {
        return { success: false, error: `Starting hole ${a.startingHole} is out of range for back nine (10-18).` };
      }
      if (!m.courseSide && (a.startingHole < 1 || a.startingHole > 18)) {
        return { success: false, error: `Starting hole ${a.startingHole} is out of range (1-18).` };
      }
    }

    // Update all in a single transaction
    await prisma.$transaction(
      assignments.map((a) =>
        prisma.scheduledMatchup.update({
          where: { id: a.matchupId },
          data: { startingHole: a.startingHole },
        })
      )
    );

    return { success: true, data: undefined };
  } catch (error) {
    logger.error("assignShotgunStartingHoles failed", error);
    return { success: false, error: error instanceof Error ? error.message : "Failed to assign starting holes." };
  }
}
