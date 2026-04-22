"use server";

import { z } from "zod";
import bcrypt from "bcryptjs";
import { Prisma } from "../../generated/prisma/client";
import { prisma } from "../db";
import { requireLeagueAdmin } from "../auth";
import { checkRateLimit, RATE_LIMITS } from "../rate-limit";
import { logger } from "../logger";
import { getServerActionIp, generateSlug, type ActionResult } from "./shared";

// ==========================================
// LEAGUE STATUS ENFORCEMENT
// ==========================================

/**
 * Require that a league is active (not suspended or cancelled).
 * Use for mutation actions (submitting matchups, creating seasons, etc.).
 * Throws an error if the league is suspended or cancelled.
 */
export async function requireActiveLeague(leagueId: number): Promise<void> {
  const league = await prisma.league.findUnique({
    where: { id: leagueId },
    select: { status: true, name: true },
  });

  if (!league) {
    throw new Error("League not found");
  }

  if (league.status === "cancelled") {
    throw new Error("This league has been cancelled and is no longer active.");
  }

  if (league.status === "suspended") {
    throw new Error("This league is currently suspended. Please contact the league administrator.");
  }
}

/**
 * Require that a league is not cancelled (allows suspended leagues for read-only access).
 * Use for read actions that should be blocked only for cancelled leagues.
 * Throws an error if the league is cancelled.
 */
export async function requireLeagueNotCancelled(leagueId: number): Promise<void> {
  const league = await prisma.league.findUnique({
    where: { id: leagueId },
    select: { status: true },
  });

  if (league?.status === "cancelled") {
    throw new Error("This league has been cancelled.");
  }
}

const createLeagueSchema = z.object({
  name: z.string().min(3, "League name must be at least 3 characters").max(100, "League name must be 100 characters or less").trim(),
  adminPassword: z.string().min(8, "Password must be at least 8 characters"),
  scoringType: z.enum(["match_play", "stroke_play", "hybrid"]),
});

export async function createLeague(
  name: string,
  adminPassword: string,
  scoringType: "match_play" | "stroke_play" | "hybrid" = "match_play"
): Promise<ActionResult<{ id: number; slug: string; name: string; adminUsername: string }>> {
  // Rate limit
  const ip = await getServerActionIp();
  const rateCheck = checkRateLimit(`create-league:${ip}`, RATE_LIMITS.createLeague);
  if (!rateCheck.allowed) {
    return { success: false, error: "Too many league creation attempts. Please try again later." };
  }

  // Validate inputs with Zod
  const parsed = createLeagueSchema.safeParse({ name, adminPassword, scoringType });
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message || "Invalid input" };
  }

  const trimmedName = parsed.data.name;
  const slug = generateSlug(trimmedName);

  try {
    // Check if slug already exists
    const existing = await prisma.league.findUnique({
      where: { slug },
    });
    if (existing) {
      return { success: false, error: "A league with a similar name already exists" };
    }

    // Generate admin username: admin@LeagueName (no spaces)
    const adminUsername = `admin@${trimmedName.replace(/\s+/g, "")}`;

    // Hash the password
    const hashedPassword = await bcrypt.hash(parsed.data.adminPassword, 12);

    // Create the league
    let league;
    try {
      league = await prisma.league.create({
        data: {
          name: trimmedName,
          slug,
          adminUsername,
          adminPassword: hashedPassword,
          scoringType: parsed.data.scoringType,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return { success: false, error: "A league with this name already exists." };
      }
      throw error;
    }

    return { success: true, data: { id: league.id, slug: league.slug, name: league.name, adminUsername: league.adminUsername } };
  } catch (error) {
    logger.error("createLeague failed", error);
    return { success: false, error: "Failed to create league. Please try again." };
  }
}

export async function changeLeaguePassword(
  leagueSlug: string,
  currentPassword: string,
  newPassword: string
): Promise<ActionResult> {
  try {
    const session = await requireLeagueAdmin(leagueSlug);
    await requireActiveLeague(session.leagueId);

    if (!currentPassword || !newPassword) {
      return { success: false, error: "Current password and new password are required" };
    }

    if (newPassword.length < 8) {
      return { success: false, error: "New password must be at least 8 characters" };
    }

    // Fetch the current password hash
    const league = await prisma.league.findUnique({
      where: { id: session.leagueId },
      select: { adminPassword: true },
    });

    if (!league) {
      return { success: false, error: "League not found" };
    }

    // Verify current password
    const isValid = await bcrypt.compare(currentPassword, league.adminPassword);
    if (!isValid) {
      return { success: false, error: "Current password is incorrect" };
    }

    // Hash and save new password
    const hashedPassword = await bcrypt.hash(newPassword, 12);
    await prisma.league.update({
      where: { id: session.leagueId },
      data: { adminPassword: hashedPassword },
    });

    return { success: true, data: undefined };
  } catch (error) {
    logger.error("changeLeaguePassword failed", error);
    return { success: false, error: "Failed to change password. Please try again." };
  }
}

export async function searchLeagues(query: string) {
  if (!query || query.trim().length < 2) {
    return [];
  }

  return prisma.league.findMany({
    where: {
      name: {
        contains: query.trim(),
      },
    },
    select: {
      id: true,
      name: true,
      slug: true,
      courseName: true,
      courseLocation: true,
      playDay: true,
    },
    take: 20,
  });
}

export async function getAllLeagues() {
  return prisma.league.findMany({
    select: {
      id: true,
      name: true,
      slug: true,
      courseName: true,
      courseLocation: true,
      playDay: true,
      _count: {
        select: { teams: { where: { status: "approved", season: { isActive: true } } } },
      },
    },
    take: 100, // Prevent unbounded results
    orderBy: { name: "asc" },
  });
}

export async function getLeagueBySlug(slug: string) {
  return prisma.league.findUnique({
    where: { slug },
    select: {
      id: true,
      name: true,
      slug: true,
      maxTeams: true,
      registrationOpen: true,
      startDate: true,
      endDate: true,
      numberOfWeeks: true,
      courseName: true,
      courseLocation: true,
      playDay: true,
      playTime: true,
      entryFee: true,
      prizeInfo: true,
      description: true,
      contactEmail: true,
      contactPhone: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      // Handicap config (needed by admin page, not sensitive)
      handicapBaseScore: true,
      handicapMultiplier: true,
      handicapRounding: true,
      handicapDefault: true,
      handicapMax: true,
      handicapMin: true,
      handicapScoreSelection: true,
      handicapScoreCount: true,
      handicapBestOf: true,
      handicapLastOf: true,
      handicapDropHighest: true,
      handicapDropLowest: true,
      handicapUseWeighting: true,
      handicapWeightRecent: true,
      handicapWeightDecay: true,
      handicapCapExceptional: true,
      handicapExceptionalCap: true,
      handicapProvWeeks: true,
      handicapProvMultiplier: true,
      handicapFreezeWeek: true,
      handicapUseTrend: true,
      handicapTrendWeight: true,
      handicapRequireApproval: true,
      // Scoring config
      scoringType: true,
      strokePlayPointPreset: true,
      strokePlayPointScale: true,
      strokePlayBonusShow: true,
      strokePlayBonusBeat: true,
      strokePlayDnpPoints: true,
      strokePlayTieMode: true,
      strokePlayDnpPenalty: true,
      strokePlayMaxDnp: true,
      strokePlayProRate: true,
      hybridFieldWeight: true,
      hybridFieldPointScale: true,
      // Schedule config
      scheduleType: true,
      scheduleVisibility: true,
      byePointsMode: true,
      byePointsFlat: true,
      scheduleExtraWeeks: true,
      midSeasonAddDefault: true,
      midSeasonRemoveAction: true,
      playoffWeeks: true,
      playoffTeams: true,
      playoffFormat: true,
      // Play mode
      playMode: true,
      playModeFirstWeekSide: true,
      // Scorecard config
      scorecardMode: true,
      scorecardRequireApproval: true,
      // EXCLUDED: adminUsername, adminPassword, billingEmail, subscriptionTier, expiresAt
    },
  });
}

export async function getLeaguePublicInfo(slug: string) {
  const league = await prisma.league.findUnique({
    where: { slug },
    select: {
      id: true,
      name: true,
      slug: true,
      scoringType: true,
      registrationOpen: true,
      maxTeams: true,
      startDate: true,
      endDate: true,
      numberOfWeeks: true,
      courseName: true,
      courseLocation: true,
      playDay: true,
      playTime: true,
      entryFee: true,
      prizeInfo: true,
      description: true,
      contactEmail: true,
      contactPhone: true,
      scheduleVisibility: true,
      scorecardMode: true,
      seasons: {
        where: { isActive: true },
        select: { id: true, name: true },
        take: 1,
      },
      _count: {
        select: { teams: { where: { status: "approved", season: { isActive: true } } } },
      },
    },
  });

  if (!league) {
    return null;
  }

  return league;
}
