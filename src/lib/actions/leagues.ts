"use server";

import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "../db";
import { requireLeagueAdmin } from "../auth";
import { checkRateLimit, RATE_LIMITS } from "../rate-limit";
import { getServerActionIp, generateSlug, type ActionResult } from "./shared";

export async function createLeague(
  name: string,
  adminPassword: string
): Promise<ActionResult<{ id: number; slug: string; name: string; adminUsername: string }>> {
  // Rate limit
  const ip = await getServerActionIp();
  const rateCheck = checkRateLimit(`create-league:${ip}`, RATE_LIMITS.createLeague);
  if (!rateCheck.allowed) {
    return { success: false, error: "Too many league creation attempts. Please try again later." };
  }

  // Validate name
  if (!name || name.trim().length < 3) {
    return { success: false, error: "League name must be at least 3 characters" };
  }

  // Validate password
  if (!adminPassword || adminPassword.length < 8) {
    return { success: false, error: "Password must be at least 8 characters" };
  }

  const trimmedName = name.trim();
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
    const hashedPassword = await bcrypt.hash(adminPassword, 10);

    // Create the league
    const league = await prisma.league.create({
      data: {
        name: trimmedName,
        slug,
        adminUsername,
        adminPassword: hashedPassword,
      },
    });

    return { success: true, data: { id: league.id, slug: league.slug, name: league.name, adminUsername: league.adminUsername } };
  } catch (error) {
    console.error("createLeague error:", error);
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
    console.error("changeLeaguePassword error:", error);
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
        select: { teams: true },
      },
    },
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
      seasons: {
        where: { isActive: true },
        select: { id: true, name: true },
        take: 1,
      },
      _count: {
        select: { teams: { where: { status: "approved" } } },
      },
    },
  });

  if (!league) {
    throw new Error("League not found");
  }

  return league;
}
