"use server";

import { z } from "zod";
import { prisma } from "../db";
import { requireLeagueAdmin } from "../auth";
import { logger } from "../logger";
import { requireActiveLeague } from "./leagues";
import type { ActionResult } from "./shared";

export interface LeagueAbout {
  leagueName: string;
  startDate: Date | null;
  endDate: Date | null;
  numberOfWeeks: number | null;
  courseName: string | null;
  courseLocation: string | null;
  playDay: string | null;
  playTime: string | null;
  entryFee: number | null;
  prizeInfo: string | null;
  description: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  registrationOpen: boolean;
  maxTeams: number;
}

export async function getLeagueAbout(leagueId: number): Promise<LeagueAbout> {
  const league = await prisma.league.findUniqueOrThrow({
    where: { id: leagueId },
    select: {
      name: true,
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
      registrationOpen: true,
      maxTeams: true,
    },
  });

  return {
    leagueName: league.name,
    startDate: league.startDate,
    endDate: league.endDate,
    numberOfWeeks: league.numberOfWeeks,
    courseName: league.courseName,
    courseLocation: league.courseLocation,
    playDay: league.playDay,
    playTime: league.playTime,
    entryFee: league.entryFee,
    prizeInfo: league.prizeInfo,
    description: league.description,
    contactEmail: league.contactEmail,
    contactPhone: league.contactPhone,
    registrationOpen: league.registrationOpen,
    maxTeams: league.maxTeams,
  };
}

const updateLeagueAboutSchema = z.object({
  leagueName: z.string().min(1).max(100),
  startDate: z.date().nullable(),
  endDate: z.date().nullable(),
  numberOfWeeks: z.number().int().min(1).max(52).nullable(),
  courseName: z.string().max(100).nullable(),
  courseLocation: z.string().max(200).nullable(),
  playDay: z.string().max(20).nullable(),
  playTime: z.string().max(20).nullable(),
  entryFee: z.number().min(0).nullable(),
  prizeInfo: z.string().max(1000).nullable(),
  description: z.string().max(2000).nullable(),
  contactEmail: z.string().email().max(255).nullable().or(z.literal("")),
  contactPhone: z.string().max(20).nullable(),
});

export type UpdateLeagueAboutInput = z.infer<typeof updateLeagueAboutSchema>;

export async function updateLeagueAbout(leagueSlug: string, data: UpdateLeagueAboutInput): Promise<ActionResult> {
  try {
    const session = await requireLeagueAdmin(leagueSlug);
    await requireActiveLeague(session.leagueId);

    const sanitizedData = {
      ...data,
      contactEmail: data.contactEmail === "" ? null : data.contactEmail,
    };

    const validated = updateLeagueAboutSchema.parse(sanitizedData);

    await prisma.league.update({
      where: { id: session.leagueId },
      data: {
        name: validated.leagueName,
        startDate: validated.startDate,
        endDate: validated.endDate,
        numberOfWeeks: validated.numberOfWeeks,
        courseName: validated.courseName,
        courseLocation: validated.courseLocation,
        playDay: validated.playDay,
        playTime: validated.playTime,
        entryFee: validated.entryFee,
        prizeInfo: validated.prizeInfo,
        description: validated.description,
        contactEmail: validated.contactEmail,
        contactPhone: validated.contactPhone,
      },
      select: { id: true },
    });

    return { success: true, data: undefined };
  } catch (error) {
    logger.error("updateLeagueAbout failed", error);
    if (error instanceof z.ZodError) {
      return { success: false, error: error.issues[0]?.message || "Invalid input" };
    }
    return { success: false, error: error instanceof Error ? error.message : "Failed to update league info" };
  }
}
