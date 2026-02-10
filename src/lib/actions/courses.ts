"use server";

import { z } from "zod";
import { prisma } from "../db";
import { requireLeagueAdmin } from "../auth";
import { requireActiveLeague } from "./leagues";
import type { ActionResult } from "./shared";

const courseInputSchema = z.object({
  name: z.string().min(1).max(200),
  holeCount: z.union([z.literal(9), z.literal(18)]),
  courseRating: z.number().min(50).max(90).nullable().optional(),
  slopeRating: z.number().int().min(55).max(155).nullable().optional(),
  holes: z.array(z.object({
    holeNumber: z.number().int().min(1).max(18),
    par: z.number().int().min(3).max(5),
    handicapIndex: z.number().int().min(1).max(18),
    yardage: z.number().int().min(50).max(700).nullable().optional(),
  })),
});

export interface HoleInput {
  holeNumber: number;
  par: number;
  handicapIndex: number;
  yardage?: number | null;
}

export interface CourseInput {
  name: string;
  location?: string | null;
  numberOfHoles: number;
  teeColor?: string | null;
  courseRating?: number | null;
  slopeRating?: number | null;
  holes: HoleInput[];
}

export interface CourseWithHoles {
  id: number;
  name: string;
  location: string | null;
  numberOfHoles: number;
  totalPar: number | null;
  teeColor: string | null;
  courseRating: number | null;
  slopeRating: number | null;
  externalId: string | null;
  dataSource: string;
  isActive: boolean;
  holes: {
    id: number;
    holeNumber: number;
    par: number;
    handicapIndex: number;
    yardage: number | null;
  }[];
}

export async function createCourse(
  leagueSlug: string,
  data: CourseInput
): Promise<ActionResult<CourseWithHoles>> {
  const session = await requireLeagueAdmin(leagueSlug);
  await requireActiveLeague(session.leagueId);

  const validated = courseInputSchema.parse({
    name: data.name,
    holeCount: data.numberOfHoles,
    courseRating: data.courseRating,
    slopeRating: data.slopeRating,
    holes: data.holes,
  });

  if (validated.holes.length !== validated.holeCount) {
    return { success: false, error: `Expected ${validated.holeCount} holes, got ${validated.holes.length}` };
  }

  // Validate unique handicap indexes
  const hcIndexes = validated.holes.map((h) => h.handicapIndex);
  if (new Set(hcIndexes).size !== hcIndexes.length) {
    return { success: false, error: "Each hole must have a unique handicap index" };
  }

  const totalPar = validated.holes.reduce((sum, h) => sum + h.par, 0);

  const course = await prisma.$transaction(async (tx) => {
    // Deactivate any existing active courses for this league
    await tx.course.updateMany({
      where: { leagueId: session.leagueId, isActive: true },
      data: { isActive: false },
    });

    return tx.course.create({
      data: {
        leagueId: session.leagueId,
        name: validated.name.trim(),
        location: data.location?.trim() || null,
        numberOfHoles: validated.holeCount,
        totalPar,
        teeColor: data.teeColor?.trim() || null,
        courseRating: validated.courseRating ?? null,
        slopeRating: validated.slopeRating ?? null,
        isActive: true,
        holes: {
          create: validated.holes.map((h) => ({
            holeNumber: h.holeNumber,
            par: h.par,
            handicapIndex: h.handicapIndex,
            yardage: h.yardage ?? null,
          })),
        },
      },
      include: {
        holes: {
          orderBy: { holeNumber: "asc" },
          select: { id: true, holeNumber: true, par: true, handicapIndex: true, yardage: true },
        },
      },
    });
  });

  return {
    success: true,
    data: {
      id: course.id,
      name: course.name,
      location: course.location,
      numberOfHoles: course.numberOfHoles,
      totalPar: course.totalPar,
      teeColor: course.teeColor,
      courseRating: course.courseRating,
      slopeRating: course.slopeRating,
      externalId: course.externalId,
      dataSource: course.dataSource,
      isActive: course.isActive,
      holes: course.holes,
    },
  };
}

export async function updateCourse(
  leagueSlug: string,
  courseId: number,
  data: CourseInput
): Promise<ActionResult<CourseWithHoles>> {
  const session = await requireLeagueAdmin(leagueSlug);
  await requireActiveLeague(session.leagueId);

  // Verify course belongs to this league
  const existing = await prisma.course.findFirst({
    where: { id: courseId, leagueId: session.leagueId },
  });
  if (!existing) {
    return { success: false, error: "Course not found" };
  }

  const validated = courseInputSchema.parse({
    name: data.name,
    holeCount: data.numberOfHoles,
    courseRating: data.courseRating,
    slopeRating: data.slopeRating,
    holes: data.holes,
  });

  if (validated.holes.length !== validated.holeCount) {
    return { success: false, error: `Expected ${validated.holeCount} holes, got ${validated.holes.length}` };
  }

  const hcIndexes = validated.holes.map((h) => h.handicapIndex);
  if (new Set(hcIndexes).size !== hcIndexes.length) {
    return { success: false, error: "Each hole must have a unique handicap index" };
  }

  const totalPar = validated.holes.reduce((sum, h) => sum + h.par, 0);

  const course = await prisma.$transaction(async (tx) => {
    // Delete existing holes and recreate
    await tx.hole.deleteMany({ where: { courseId } });

    return tx.course.update({
      where: { id: courseId },
      data: {
        name: validated.name.trim(),
        location: data.location?.trim() || null,
        numberOfHoles: validated.holeCount,
        totalPar,
        teeColor: data.teeColor?.trim() || null,
        courseRating: validated.courseRating ?? null,
        slopeRating: validated.slopeRating ?? null,
        holes: {
          create: validated.holes.map((h) => ({
            holeNumber: h.holeNumber,
            par: h.par,
            handicapIndex: h.handicapIndex,
            yardage: h.yardage ?? null,
          })),
        },
      },
      include: {
        holes: {
          orderBy: { holeNumber: "asc" },
          select: { id: true, holeNumber: true, par: true, handicapIndex: true, yardage: true },
        },
      },
    });
  });

  return {
    success: true,
    data: {
      id: course.id,
      name: course.name,
      location: course.location,
      numberOfHoles: course.numberOfHoles,
      totalPar: course.totalPar,
      teeColor: course.teeColor,
      courseRating: course.courseRating,
      slopeRating: course.slopeRating,
      externalId: course.externalId,
      dataSource: course.dataSource,
      isActive: course.isActive,
      holes: course.holes,
    },
  };
}

export async function deleteCourse(
  leagueSlug: string,
  courseId: number
): Promise<ActionResult> {
  const session = await requireLeagueAdmin(leagueSlug);
  await requireActiveLeague(session.leagueId);

  const existing = await prisma.course.findFirst({
    where: { id: courseId, leagueId: session.leagueId },
    include: { _count: { select: { scorecards: true } } },
  });
  if (!existing) {
    return { success: false, error: "Course not found" };
  }
  if (existing._count.scorecards > 0) {
    return { success: false, error: "Cannot delete a course that has scorecards. Deactivate it instead." };
  }

  await prisma.course.delete({ where: { id: courseId } });
  return { success: true, data: undefined };
}

export async function getCourseWithHoles(
  leagueSlug: string
): Promise<CourseWithHoles | null> {
  const session = await requireLeagueAdmin(leagueSlug);
  const leagueId = session.leagueId;

  const course = await prisma.course.findFirst({
    where: { leagueId, isActive: true },
    include: {
      holes: {
        orderBy: { holeNumber: "asc" },
        select: { id: true, holeNumber: true, par: true, handicapIndex: true, yardage: true },
      },
    },
  });

  if (!course) return null;

  return {
    id: course.id,
    name: course.name,
    location: course.location,
    numberOfHoles: course.numberOfHoles,
    totalPar: course.totalPar,
    teeColor: course.teeColor,
    courseRating: course.courseRating,
    slopeRating: course.slopeRating,
    externalId: course.externalId,
    dataSource: course.dataSource,
    isActive: course.isActive,
    holes: course.holes,
  };
}
