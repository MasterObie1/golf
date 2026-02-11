"use server";

import { Prisma } from "../../generated/prisma/client";
import { prisma } from "../db";
import { requireLeagueAdmin } from "../auth";
import { logger } from "../logger";
import { createScorecardToken, verifyScorecardToken } from "../scorecard-auth";
import { sendScorecardEmail, isEmailConfigured } from "../email";
import { requireActiveLeague } from "./leagues";
import type { ActionResult } from "./shared";
import { filterHolesByCourseSide, isHoleInPlay, getExpectedHoleCount } from "../scheduling/course-side";

// ── Types ───────────────────────────────────────────────

export interface ScorecardDetail {
  id: number;
  leagueId: number;
  courseId: number;
  teamId: number;
  teamName: string;
  seasonId: number | null;
  weekNumber: number;
  matchupId: number | null;
  teamSide: string | null;
  courseSide: string | null;
  weeklyScoreId: number | null;
  grossTotal: number | null;
  frontNine: number | null;
  backNine: number | null;
  status: string;
  playerName: string | null;
  startedAt: Date;
  completedAt: Date | null;
  approvedAt: Date | null;
  course: {
    id: number;
    name: string;
    numberOfHoles: number;
    totalPar: number | null;
    holes: {
      id: number;
      holeNumber: number;
      par: number;
      handicapIndex: number;
      yardage: number | null;
    }[];
  };
  holeScores: {
    id: number;
    holeNumber: number;
    strokes: number;
    putts: number | null;
    fairwayHit: boolean | null;
    greenInReg: boolean | null;
  }[];
}

export interface ScorecardSummary {
  id: number;
  teamId: number;
  teamName: string;
  weekNumber: number;
  grossTotal: number | null;
  frontNine: number | null;
  backNine: number | null;
  status: string;
  playerName: string | null;
  completedAt: Date | null;
  approvedAt: Date | null;
  holesCompleted: number;
  totalHoles: number;
  totalPar: number | null;
  matchupId: number | null;
}

// ── Player-Facing Actions ───────────────────────────────

export async function getScorecardByToken(token: string): Promise<ActionResult<ScorecardDetail>> {
  const payload = await verifyScorecardToken(token);
  if (!payload) {
    return { success: false, error: "Invalid or expired scorecard link. Please request a new link from your league admin." };
  }

  const scorecard = await prisma.scorecard.findUnique({
    where: { id: payload.scorecardId },
    include: {
      team: { select: { name: true } },
      course: {
        include: {
          holes: {
            orderBy: { holeNumber: "asc" },
            select: { id: true, holeNumber: true, par: true, handicapIndex: true, yardage: true },
          },
        },
      },
      holeScores: {
        orderBy: { holeNumber: "asc" },
        select: { id: true, holeNumber: true, strokes: true, putts: true, fairwayHit: true, greenInReg: true },
      },
    },
  });

  if (!scorecard) {
    return { success: false, error: "Scorecard not found." };
  }

  // Verify the scorecard's leagueId matches the token's leagueId claim
  if (scorecard.leagueId !== payload.leagueId) {
    return { success: false, error: "Scorecard not found." };
  }

  if (scorecard.status === "approved") {
    return { success: false, error: "This scorecard has already been approved and cannot be edited." };
  }

  // Filter holes by courseSide if set
  const filteredHoles = filterHolesByCourseSide(scorecard.course.holes, scorecard.courseSide);
  const adjustedNumberOfHoles = getExpectedHoleCount(scorecard.course.numberOfHoles, scorecard.courseSide);
  const adjustedTotalPar = scorecard.courseSide
    ? filteredHoles.reduce((sum, h) => sum + h.par, 0)
    : scorecard.course.totalPar;

  return {
    success: true,
    data: {
      id: scorecard.id,
      leagueId: scorecard.leagueId,
      courseId: scorecard.courseId,
      teamId: scorecard.teamId,
      teamName: scorecard.team.name,
      seasonId: scorecard.seasonId,
      weekNumber: scorecard.weekNumber,
      matchupId: scorecard.matchupId,
      teamSide: scorecard.teamSide,
      courseSide: scorecard.courseSide,
      weeklyScoreId: scorecard.weeklyScoreId,
      grossTotal: scorecard.grossTotal,
      frontNine: scorecard.frontNine,
      backNine: scorecard.backNine,
      status: scorecard.status,
      playerName: scorecard.playerName,
      startedAt: scorecard.startedAt,
      completedAt: scorecard.completedAt,
      approvedAt: scorecard.approvedAt,
      course: {
        id: scorecard.course.id,
        name: scorecard.course.name,
        numberOfHoles: adjustedNumberOfHoles,
        totalPar: adjustedTotalPar,
        holes: filteredHoles,
      },
      holeScores: scorecard.holeScores,
    },
  };
}

export async function saveHoleScore(
  token: string,
  holeNumber: number,
  strokes: number,
  putts?: number | null,
  fairwayHit?: boolean | null,
  greenInReg?: boolean | null
): Promise<ActionResult> {
  const payload = await verifyScorecardToken(token);
  if (!payload) {
    return { success: false, error: "Invalid or expired link." };
  }

  // Rate limit by scorecard ID to prevent abuse from leaked tokens
  const { checkRateLimit, RATE_LIMITS } = await import("../rate-limit");
  const rateLimitResult = checkRateLimit(`scorecard-save:${payload.scorecardId}`, RATE_LIMITS.scorecardSave);
  if (!rateLimitResult.allowed) {
    return { success: false, error: "Too many saves. Please wait a moment and try again." };
  }

  const scorecard = await prisma.scorecard.findUnique({
    where: { id: payload.scorecardId },
    include: {
      course: {
        include: { holes: { where: { holeNumber }, select: { id: true } } },
      },
    },
  });

  if (!scorecard) {
    return { success: false, error: "Scorecard not found." };
  }
  if (scorecard.status === "approved") {
    return { success: false, error: "This scorecard is already approved." };
  }

  // Validate hole is in play for this scorecard's courseSide
  if (!isHoleInPlay(holeNumber, scorecard.courseSide)) {
    return { success: false, error: `Hole ${holeNumber} is not in play for this scorecard.` };
  }

  const hole = scorecard.course.holes[0];
  if (!hole) {
    return { success: false, error: `Hole ${holeNumber} not found on this course.` };
  }

  if (strokes < 1 || strokes > 20) {
    return { success: false, error: "Strokes must be between 1 and 20." };
  }

  // Upsert score + status reset atomically
  await prisma.$transaction(async (tx) => {
    await tx.holeScore.upsert({
      where: {
        scorecardId_holeNumber: {
          scorecardId: payload.scorecardId,
          holeNumber,
        },
      },
      create: {
        scorecardId: payload.scorecardId,
        holeId: hole.id,
        holeNumber,
        strokes,
        putts: putts ?? null,
        fairwayHit: fairwayHit ?? null,
        greenInReg: greenInReg ?? null,
      },
      update: {
        strokes,
        putts: putts ?? null,
        fairwayHit: fairwayHit ?? null,
        greenInReg: greenInReg ?? null,
      },
    });

    // If scorecard was rejected, reset to in_progress when player edits
    if (scorecard.status === "rejected") {
      await tx.scorecard.update({
        where: { id: payload.scorecardId },
        data: { status: "in_progress" },
      });
    }
  });

  return { success: true, data: undefined };
}

export async function submitScorecard(token: string): Promise<ActionResult<{ grossTotal: number; frontNine: number | null; backNine: number | null }>> {
  const payload = await verifyScorecardToken(token);
  if (!payload) {
    return { success: false, error: "Invalid or expired link." };
  }

  const scorecard = await prisma.scorecard.findUnique({
    where: { id: payload.scorecardId },
    include: {
      course: { select: { numberOfHoles: true } },
      holeScores: {
        orderBy: { holeNumber: "asc" },
        select: { holeNumber: true, strokes: true },
      },
    },
  });

  if (!scorecard) {
    return { success: false, error: "Scorecard not found." };
  }
  if (scorecard.status === "approved") {
    return { success: false, error: "This scorecard is already approved." };
  }

  // Must have scores for all expected holes
  const expectedHoles = getExpectedHoleCount(scorecard.course.numberOfHoles, scorecard.courseSide);
  if (scorecard.holeScores.length < expectedHoles) {
    return {
      success: false,
      error: `Please enter scores for all ${expectedHoles} holes. You have ${scorecard.holeScores.length} entered.`,
    };
  }

  const grossTotal = scorecard.holeScores.reduce((sum, hs) => sum + hs.strokes, 0);
  const frontNineScores = scorecard.holeScores.filter((hs) => hs.holeNumber <= 9);
  const backNineScores = scorecard.holeScores.filter((hs) => hs.holeNumber > 9);
  const frontNine = frontNineScores.length > 0
    ? frontNineScores.reduce((sum, hs) => sum + hs.strokes, 0)
    : null;
  const backNine = backNineScores.length > 0
    ? backNineScores.reduce((sum, hs) => sum + hs.strokes, 0)
    : null;

  await prisma.scorecard.update({
    where: { id: payload.scorecardId },
    data: {
      grossTotal,
      frontNine,
      backNine,
      status: "completed",
      completedAt: new Date(),
    },
  });

  return { success: true, data: { grossTotal, frontNine, backNine } };
}

// ── Admin Actions ───────────────────────────────────────

export async function generateScorecardLink(
  leagueSlug: string,
  teamId: number,
  weekNumber: number,
  seasonId?: number | null
): Promise<ActionResult<{ url: string; scorecardId: number }>> {
  const session = await requireLeagueAdmin(leagueSlug);
  await requireActiveLeague(session.leagueId);

  // Get active course
  const course = await prisma.course.findFirst({
    where: { leagueId: session.leagueId, isActive: true },
  });
  if (!course) {
    return { success: false, error: "No course configured. Set up a course first in the Course tab." };
  }

  // Verify team exists in this league
  const team = await prisma.team.findFirst({
    where: { id: teamId, leagueId: session.leagueId },
  });
  if (!team) {
    return { success: false, error: "Team not found in this league." };
  }

  // Look up scheduled matchup to get courseSide
  const scheduledMatchup = await prisma.scheduledMatchup.findFirst({
    where: {
      leagueId: session.leagueId,
      weekNumber,
      status: "scheduled",
      OR: [{ teamAId: teamId }, { teamBId: teamId }],
    },
    select: { courseSide: true },
  });

  // Validate course has enough holes for the assigned side
  // Front 9 works on any course (holes 1-9), but Back 9 requires 18 holes (holes 10-18)
  const courseSide = scheduledMatchup?.courseSide ?? null;
  if (courseSide === "back" && course.numberOfHoles < 18) {
    return {
      success: false,
      error: `This week is set to play the Back 9, but the course only has ${course.numberOfHoles} holes. Update the course to 18 holes or change the play mode.`,
    };
  }

  // Upsert scorecard atomically (eliminates TOCTOU race condition)
  // Update courseId on existing scorecards so they use the current active course
  const scorecard = await prisma.scorecard.upsert({
    where: {
      leagueId_weekNumber_teamId: {
        leagueId: session.leagueId,
        weekNumber,
        teamId,
      },
    },
    create: {
      leagueId: session.leagueId,
      courseId: course.id,
      teamId,
      seasonId: seasonId ?? null,
      weekNumber,
      status: "in_progress",
      courseSide,
    },
    update: { courseId: course.id },
  });
  const scorecardId = scorecard.id;

  // Generate token
  const token = await createScorecardToken({
    scorecardId,
    teamId,
    leagueId: session.leagueId,
    weekNumber,
  });

  // Store token on scorecard
  await prisma.scorecard.update({
    where: { id: scorecardId },
    data: {
      accessToken: token,
      tokenExpiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
    },
  });

  const url = `/league/${leagueSlug}/scorecard/${token}`;

  return { success: true, data: { url, scorecardId } };
}

export async function approveScorecard(
  leagueSlug: string,
  scorecardId: number
): Promise<ActionResult> {
  const session = await requireLeagueAdmin(leagueSlug);
  await requireActiveLeague(session.leagueId);

  const scorecard = await prisma.scorecard.findFirst({
    where: { id: scorecardId, leagueId: session.leagueId },
  });

  if (!scorecard) {
    return { success: false, error: "Scorecard not found." };
  }
  if (scorecard.status === "approved") {
    return { success: false, error: "Scorecard is already approved." };
  }
  if (scorecard.status === "in_progress") {
    return { success: false, error: "Scorecard has not been submitted yet." };
  }
  if (scorecard.grossTotal === null) {
    return { success: false, error: "Scorecard has no total score." };
  }

  await prisma.scorecard.update({
    where: { id: scorecardId },
    data: {
      status: "approved",
      approvedAt: new Date(),
    },
  });

  return { success: true, data: undefined };
}

export async function rejectScorecard(
  leagueSlug: string,
  scorecardId: number
): Promise<ActionResult> {
  const session = await requireLeagueAdmin(leagueSlug);
  await requireActiveLeague(session.leagueId);

  const scorecard = await prisma.scorecard.findFirst({
    where: { id: scorecardId, leagueId: session.leagueId },
  });

  if (!scorecard) {
    return { success: false, error: "Scorecard not found." };
  }
  if (scorecard.status === "in_progress") {
    return { success: false, error: "Scorecard has not been submitted yet." };
  }

  await prisma.scorecard.update({
    where: { id: scorecardId },
    data: { status: "rejected" },
  });

  return { success: true, data: undefined };
}

export async function getScorecardsForWeek(
  leagueSlug: string,
  weekNumber: number
): Promise<ScorecardSummary[]> {
  const session = await requireLeagueAdmin(leagueSlug);
  const leagueId = session.leagueId;

  const scorecards = await prisma.scorecard.findMany({
    where: { leagueId, weekNumber },
    include: {
      team: { select: { name: true } },
      course: { select: { numberOfHoles: true, totalPar: true } },
      _count: { select: { holeScores: true } },
    },
    orderBy: { team: { name: "asc" } },
  });

  return scorecards.map((sc) => ({
    id: sc.id,
    teamId: sc.teamId,
    teamName: sc.team.name,
    weekNumber: sc.weekNumber,
    grossTotal: sc.grossTotal,
    frontNine: sc.frontNine,
    backNine: sc.backNine,
    status: sc.status,
    playerName: sc.playerName,
    completedAt: sc.completedAt,
    approvedAt: sc.approvedAt,
    holesCompleted: sc._count.holeScores,
    totalHoles: sc.course.numberOfHoles,
    totalPar: sc.course.totalPar,
    matchupId: sc.matchupId,
  }));
}

export async function getScorecardDetail(
  leagueSlug: string,
  scorecardId: number
): Promise<ActionResult<ScorecardDetail>> {
  const session = await requireLeagueAdmin(leagueSlug);

  const scorecard = await prisma.scorecard.findFirst({
    where: { id: scorecardId, leagueId: session.leagueId },
    include: {
      team: { select: { name: true } },
      course: {
        include: {
          holes: {
            orderBy: { holeNumber: "asc" },
            select: { id: true, holeNumber: true, par: true, handicapIndex: true, yardage: true },
          },
        },
      },
      holeScores: {
        orderBy: { holeNumber: "asc" },
        select: { id: true, holeNumber: true, strokes: true, putts: true, fairwayHit: true, greenInReg: true },
      },
    },
  });

  if (!scorecard) {
    return { success: false, error: "Scorecard not found." };
  }

  return {
    success: true,
    data: {
      id: scorecard.id,
      leagueId: scorecard.leagueId,
      courseId: scorecard.courseId,
      teamId: scorecard.teamId,
      teamName: scorecard.team.name,
      seasonId: scorecard.seasonId,
      weekNumber: scorecard.weekNumber,
      matchupId: scorecard.matchupId,
      teamSide: scorecard.teamSide,
      courseSide: scorecard.courseSide,
      weeklyScoreId: scorecard.weeklyScoreId,
      grossTotal: scorecard.grossTotal,
      frontNine: scorecard.frontNine,
      backNine: scorecard.backNine,
      status: scorecard.status,
      playerName: scorecard.playerName,
      startedAt: scorecard.startedAt,
      completedAt: scorecard.completedAt,
      approvedAt: scorecard.approvedAt,
      course: {
        id: scorecard.course.id,
        name: scorecard.course.name,
        numberOfHoles: scorecard.course.numberOfHoles,
        totalPar: scorecard.course.totalPar,
        holes: scorecard.course.holes,
      },
      holeScores: scorecard.holeScores,
    },
  };
}

export async function adminSaveHoleScore(
  leagueSlug: string,
  scorecardId: number,
  holeNumber: number,
  strokes: number
): Promise<ActionResult> {
  const session = await requireLeagueAdmin(leagueSlug);
  await requireActiveLeague(session.leagueId);

  const scorecard = await prisma.scorecard.findFirst({
    where: { id: scorecardId, leagueId: session.leagueId },
    include: {
      course: {
        include: { holes: { where: { holeNumber }, select: { id: true } } },
      },
    },
  });

  if (!scorecard) {
    return { success: false, error: "Scorecard not found." };
  }

  const hole = scorecard.course.holes[0];
  if (!hole) {
    return { success: false, error: `Hole ${holeNumber} not found.` };
  }

  if (strokes < 1 || strokes > 20) {
    return { success: false, error: "Strokes must be between 1 and 20." };
  }

  // Upsert score + recalculate totals + update scorecard atomically
  await prisma.$transaction(async (tx) => {
    await tx.holeScore.upsert({
      where: {
        scorecardId_holeNumber: { scorecardId, holeNumber },
      },
      create: {
        scorecardId,
        holeId: hole.id,
        holeNumber,
        strokes,
      },
      update: { strokes },
    });

    // Recalculate totals
    const allScores = await tx.holeScore.findMany({
      where: { scorecardId },
      select: { holeNumber: true, strokes: true },
    });

    const grossTotal = allScores.reduce((sum, hs) => sum + hs.strokes, 0);
    const frontNine = allScores.filter((hs) => hs.holeNumber <= 9).reduce((sum, hs) => sum + hs.strokes, 0);
    const backNine = scorecard.course.holes.length > 0 && allScores.some((hs) => hs.holeNumber > 9)
      ? allScores.filter((hs) => hs.holeNumber > 9).reduce((sum, hs) => sum + hs.strokes, 0)
      : null;

    await tx.scorecard.update({
      where: { id: scorecardId },
      data: { grossTotal, frontNine, backNine },
    });
  });

  return { success: true, data: undefined };
}

/**
 * Get approved scorecard gross totals for pre-filling matchup/weekly score entries.
 */
export async function getApprovedScorecardScores(
  leagueId: number,
  weekNumber: number
): Promise<Map<number, number>> {
  const scorecards = await prisma.scorecard.findMany({
    where: {
      leagueId,
      weekNumber,
      status: "approved",
      grossTotal: { not: null },
    },
    select: { teamId: true, grossTotal: true },
  });

  const map = new Map<number, number>();
  for (const sc of scorecards) {
    if (sc.grossTotal !== null) {
      map.set(sc.teamId, sc.grossTotal);
    }
  }
  return map;
}

/**
 * Get approved scorecard gross totals as a serializable array (for client components).
 */
export async function getApprovedScorecardScoresForWeek(
  leagueId: number,
  weekNumber: number
): Promise<{ teamId: number; grossTotal: number }[]> {
  const scorecards = await prisma.scorecard.findMany({
    where: {
      leagueId,
      weekNumber,
      status: "approved",
      grossTotal: { not: null },
    },
    select: { teamId: true, grossTotal: true },
  });

  return scorecards
    .filter((sc): sc is typeof sc & { grossTotal: number } => sc.grossTotal !== null)
    .map((sc) => ({ teamId: sc.teamId, grossTotal: sc.grossTotal }));
}

/**
 * Get scorecards for public display (approved only).
 */
export async function checkEmailConfigured(): Promise<boolean> {
  return isEmailConfigured();
}

export async function emailScorecardLink(
  leagueSlug: string,
  teamId: number,
  weekNumber: number,
  seasonId?: number | null
): Promise<ActionResult> {
  const session = await requireLeagueAdmin(leagueSlug);

  // Look up team email and captain name
  const team = await prisma.team.findFirst({
    where: { id: teamId, leagueId: session.leagueId },
    select: { name: true, email: true, captainName: true },
  });

  if (!team) {
    return { success: false, error: "Team not found in this league." };
  }
  if (!team.email) {
    return { success: false, error: "No email address on file for this team." };
  }

  // Get league name for the email subject
  const league = await prisma.league.findUnique({
    where: { id: session.leagueId },
    select: { name: true },
  });

  // Generate the scorecard link (creates scorecard if needed + JWT token)
  const linkResult = await generateScorecardLink(leagueSlug, teamId, weekNumber, seasonId);
  if (!linkResult.success) {
    return { success: false, error: linkResult.error };
  }

  // Build the full URL — use NEXT_PUBLIC_BASE_URL or fall back to a relative-safe default
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || `https://${process.env.VERCEL_URL || "localhost:3000"}`;
  const scorecardUrl = `${baseUrl}${linkResult.data.url}`;

  const emailResult = await sendScorecardEmail({
    to: team.email,
    captainName: team.captainName || "Captain",
    teamName: team.name,
    leagueName: league?.name || "Your League",
    weekNumber,
    scorecardUrl,
  });

  if (!emailResult.success) {
    return { success: false, error: emailResult.error };
  }

  return { success: true, data: undefined };
}

/**
 * Lightweight check: which teams have approved scorecards in a given season?
 * Returns an array of { weekNumber, teamId } for pre-checking availability.
 */
export async function getScorecardAvailabilityForSeason(
  leagueId: number,
  seasonId: number
): Promise<{ weekNumber: number; teamId: number }[]> {
  const scorecards = await prisma.scorecard.findMany({
    where: { leagueId, seasonId, status: "approved" },
    select: { weekNumber: true, teamId: true },
  });
  return scorecards;
}

/**
 * Fetch a single approved scorecard for public display by (leagueId, weekNumber, teamId).
 * Returns null if no approved scorecard exists.
 */
export async function getPublicScorecardForTeamWeek(
  leagueId: number,
  weekNumber: number,
  teamId: number
): Promise<ScorecardDetail | null> {
  const scorecard = await prisma.scorecard.findUnique({
    where: {
      leagueId_weekNumber_teamId: { leagueId, weekNumber, teamId },
    },
    include: {
      team: { select: { name: true } },
      course: {
        include: {
          holes: {
            orderBy: { holeNumber: "asc" },
            select: { id: true, holeNumber: true, par: true, handicapIndex: true, yardage: true },
          },
        },
      },
      holeScores: {
        orderBy: { holeNumber: "asc" },
        select: { id: true, holeNumber: true, strokes: true, putts: true, fairwayHit: true, greenInReg: true },
      },
    },
  });

  if (!scorecard || scorecard.status !== "approved") {
    return null;
  }

  return {
    id: scorecard.id,
    leagueId: scorecard.leagueId,
    courseId: scorecard.courseId,
    teamId: scorecard.teamId,
    teamName: scorecard.team.name,
    seasonId: scorecard.seasonId,
    weekNumber: scorecard.weekNumber,
    matchupId: scorecard.matchupId,
    teamSide: scorecard.teamSide,
    courseSide: scorecard.courseSide,
    weeklyScoreId: scorecard.weeklyScoreId,
    grossTotal: scorecard.grossTotal,
    frontNine: scorecard.frontNine,
    backNine: scorecard.backNine,
    status: scorecard.status,
    playerName: scorecard.playerName,
    startedAt: scorecard.startedAt,
    completedAt: scorecard.completedAt,
    approvedAt: scorecard.approvedAt,
    course: {
      id: scorecard.course.id,
      name: scorecard.course.name,
      numberOfHoles: scorecard.course.numberOfHoles,
      totalPar: scorecard.course.totalPar,
      holes: scorecard.course.holes,
    },
    holeScores: scorecard.holeScores,
  };
}

export interface BulkScorecardResult {
  teamId: number;
  teamName: string;
  url: string;
  email: string | null;
  phone: string | null;
}

export async function generateAllScorecardLinks(
  leagueSlug: string,
  weekNumber: number,
  seasonId?: number | null
): Promise<ActionResult<BulkScorecardResult[]>> {
  const session = await requireLeagueAdmin(leagueSlug);
  await requireActiveLeague(session.leagueId);

  // Fetch all approved teams with contact info
  const teams = await prisma.team.findMany({
    where: { leagueId: session.leagueId, status: "approved" },
    select: { id: true, name: true, email: true, phone: true },
    orderBy: { name: "asc" },
  });

  if (teams.length === 0) {
    return { success: false, error: "No approved teams in this league." };
  }

  // Check which teams already have scorecards for this week
  const existingScorecards = await prisma.scorecard.findMany({
    where: { leagueId: session.leagueId, weekNumber },
    select: { teamId: true, accessToken: true },
  });
  const existingMap = new Map(existingScorecards.map((sc) => [sc.teamId, sc.accessToken]));

  // Generate links for teams that don't have one yet, using Promise.allSettled
  const teamsNeedingLinks = teams.filter((t) => !existingMap.has(t.id));
  const results = await Promise.allSettled(
    teamsNeedingLinks.map((team) =>
      generateScorecardLink(leagueSlug, team.id, weekNumber, seasonId)
    )
  );

  // Build the result array for all teams
  const allResults: BulkScorecardResult[] = [];

  for (const team of teams) {
    if (existingMap.has(team.id)) {
      // Existing scorecard — reconstruct URL from stored token
      const token = existingMap.get(team.id);
      const url = token ? `/league/${leagueSlug}/scorecard/${token}` : "";
      allResults.push({
        teamId: team.id,
        teamName: team.name,
        url,
        email: team.email,
        phone: team.phone,
      });
    } else {
      // Find the result from Promise.allSettled
      const idx = teamsNeedingLinks.findIndex((t) => t.id === team.id);
      const settled = results[idx];
      if (settled?.status === "fulfilled" && settled.value.success) {
        allResults.push({
          teamId: team.id,
          teamName: team.name,
          url: settled.value.data.url,
          email: team.email,
          phone: team.phone,
        });
      } else {
        // Include the team with empty URL so the admin knows it failed
        allResults.push({
          teamId: team.id,
          teamName: team.name,
          url: "",
          email: team.email,
          phone: team.phone,
        });
      }
    }
  }

  return { success: true, data: allResults };
}

export async function adminCreateScorecard(
  leagueSlug: string,
  teamId: number,
  weekNumber: number,
  seasonId?: number | null,
  matchupId?: number | null,
  teamSide?: string | null,
  playerName?: string | null
): Promise<ActionResult<ScorecardDetail>> {
  const session = await requireLeagueAdmin(leagueSlug);
  await requireActiveLeague(session.leagueId);

  // Get active course
  const course = await prisma.course.findFirst({
    where: { leagueId: session.leagueId, isActive: true },
  });
  if (!course) {
    return { success: false, error: "No course configured. Set up a course first in the Course tab." };
  }

  // Verify team exists in this league
  const team = await prisma.team.findFirst({
    where: { id: teamId, leagueId: session.leagueId },
  });
  if (!team) {
    return { success: false, error: "Team not found in this league." };
  }

  // Check for existing scorecard (respects @@unique([leagueId, weekNumber, teamId]))
  const existing = await prisma.scorecard.findUnique({
    where: {
      leagueId_weekNumber_teamId: {
        leagueId: session.leagueId,
        weekNumber,
        teamId,
      },
    },
  });

  let scorecardId: number;

  if (existing) {
    scorecardId = existing.id;
    // Update matchup link and player name if provided
    const updateData: Record<string, unknown> = {};
    if (matchupId !== undefined) updateData.matchupId = matchupId ?? null;
    if (teamSide !== undefined) updateData.teamSide = teamSide ?? null;
    if (playerName !== undefined) updateData.playerName = playerName ?? null;
    if (Object.keys(updateData).length > 0) {
      await prisma.scorecard.update({ where: { id: scorecardId }, data: updateData });
    }
  } else {
    // Auto-detect teamSide if matchupId provided but teamSide not specified
    let resolvedTeamSide = teamSide ?? null;
    if (matchupId && !teamSide) {
      const matchup = await prisma.matchup.findFirst({
        where: { id: matchupId, leagueId: session.leagueId },
      });
      if (matchup) {
        resolvedTeamSide = matchup.teamAId === teamId ? "A" : matchup.teamBId === teamId ? "B" : null;
      }
    }

    let created;
    try {
      created = await prisma.scorecard.create({
        data: {
          leagueId: session.leagueId,
          courseId: course.id,
          teamId,
          seasonId: seasonId ?? null,
          weekNumber,
          matchupId: matchupId ?? null,
          teamSide: resolvedTeamSide,
          playerName: playerName ?? null,
          status: "in_progress",
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return { success: false, error: "A scorecard already exists for this team and week." };
      }
      throw error;
    }
    scorecardId = created.id;
  }

  // Return full ScorecardDetail
  return getScorecardDetail(leagueSlug, scorecardId);
}

export async function adminCompleteAndApproveScorecard(
  leagueSlug: string,
  scorecardId: number
): Promise<ActionResult> {
  const session = await requireLeagueAdmin(leagueSlug);
  await requireActiveLeague(session.leagueId);

  const scorecard = await prisma.scorecard.findFirst({
    where: { id: scorecardId, leagueId: session.leagueId },
    include: {
      course: { select: { numberOfHoles: true } },
      holeScores: {
        orderBy: { holeNumber: "asc" },
        select: { holeNumber: true, strokes: true },
      },
    },
  });

  if (!scorecard) {
    return { success: false, error: "Scorecard not found." };
  }
  if (scorecard.status === "approved") {
    return { success: false, error: "Scorecard is already approved." };
  }
  const expectedHoles = getExpectedHoleCount(scorecard.course.numberOfHoles, scorecard.courseSide);
  if (scorecard.holeScores.length < expectedHoles) {
    return {
      success: false,
      error: `All ${expectedHoles} holes must have scores. Currently ${scorecard.holeScores.length} entered.`,
    };
  }

  const grossTotal = scorecard.holeScores.reduce((sum, hs) => sum + hs.strokes, 0);
  const frontNineScores = scorecard.holeScores.filter((hs) => hs.holeNumber <= 9);
  const backNineScores = scorecard.holeScores.filter((hs) => hs.holeNumber > 9);
  const frontNine = frontNineScores.length > 0
    ? frontNineScores.reduce((sum, hs) => sum + hs.strokes, 0)
    : null;
  const backNine = backNineScores.length > 0
    ? backNineScores.reduce((sum, hs) => sum + hs.strokes, 0)
    : null;

  await prisma.scorecard.update({
    where: { id: scorecardId },
    data: {
      grossTotal,
      frontNine,
      backNine,
      status: "approved",
      completedAt: new Date(),
      approvedAt: new Date(),
    },
  });

  return { success: true, data: undefined };
}

export async function adminLinkScorecardToMatchup(
  leagueSlug: string,
  scorecardId: number,
  matchupId: number | null,
  teamSide: string | null
): Promise<ActionResult> {
  const session = await requireLeagueAdmin(leagueSlug);

  const scorecard = await prisma.scorecard.findFirst({
    where: { id: scorecardId, leagueId: session.leagueId },
  });

  if (!scorecard) {
    return { success: false, error: "Scorecard not found." };
  }

  if (matchupId !== null) {
    const matchup = await prisma.matchup.findFirst({
      where: { id: matchupId, leagueId: session.leagueId },
    });
    if (!matchup) {
      return { success: false, error: "Matchup not found in this league." };
    }
    // Auto-detect teamSide if not provided
    if (!teamSide) {
      teamSide = matchup.teamAId === scorecard.teamId ? "A" : matchup.teamBId === scorecard.teamId ? "B" : null;
    }
  }

  await prisma.scorecard.update({
    where: { id: scorecardId },
    data: {
      matchupId: matchupId,
      teamSide: matchupId !== null ? teamSide : null,
    },
  });

  return { success: true, data: undefined };
}

export async function getPublicScorecardsForWeek(
  leagueId: number,
  weekNumber: number
): Promise<ScorecardDetail[]> {
  const scorecards = await prisma.scorecard.findMany({
    where: { leagueId, weekNumber, status: "approved" },
    include: {
      team: { select: { name: true } },
      course: {
        include: {
          holes: {
            orderBy: { holeNumber: "asc" },
            select: { id: true, holeNumber: true, par: true, handicapIndex: true, yardage: true },
          },
        },
      },
      holeScores: {
        orderBy: { holeNumber: "asc" },
        select: { id: true, holeNumber: true, strokes: true, putts: true, fairwayHit: true, greenInReg: true },
      },
    },
    orderBy: { grossTotal: "asc" },
  });

  return scorecards.map((sc) => ({
    id: sc.id,
    leagueId: sc.leagueId,
    courseId: sc.courseId,
    teamId: sc.teamId,
    teamName: sc.team.name,
    seasonId: sc.seasonId,
    weekNumber: sc.weekNumber,
    matchupId: sc.matchupId,
    teamSide: sc.teamSide,
    courseSide: sc.courseSide,
    weeklyScoreId: sc.weeklyScoreId,
    grossTotal: sc.grossTotal,
    frontNine: sc.frontNine,
    backNine: sc.backNine,
    status: sc.status,
    playerName: sc.playerName,
    startedAt: sc.startedAt,
    completedAt: sc.completedAt,
    approvedAt: sc.approvedAt,
    course: {
      id: sc.course.id,
      name: sc.course.name,
      numberOfHoles: sc.course.numberOfHoles,
      totalPar: sc.course.totalPar,
      holes: sc.course.holes,
    },
    holeScores: sc.holeScores,
  }));
}
