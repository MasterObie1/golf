"use server";

import { z } from "zod";
import { prisma } from "../db";
import { requireLeagueAdmin } from "../auth";
import { requireActiveLeague } from "./leagues";
import type { ActionResult } from "./shared";

class UserError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserError";
  }
}

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
    include: { holes: { select: { id: true, holeNumber: true } } },
  });
  if (!existing) {
    return { success: false, error: "Course not found" };
  }

  let validated;
  try {
    validated = courseInputSchema.parse({
      name: data.name,
      holeCount: data.numberOfHoles,
      courseRating: data.courseRating,
      slopeRating: data.slopeRating,
      holes: data.holes,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return { success: false, error: err.issues.map((i) => i.message).join("; ") };
    }
    throw err;
  }

  if (validated.holes.length !== validated.holeCount) {
    return { success: false, error: `Expected ${validated.holeCount} holes, got ${validated.holes.length}` };
  }

  const hcIndexes = validated.holes.map((h) => h.handicapIndex);
  if (new Set(hcIndexes).size !== hcIndexes.length) {
    return { success: false, error: "Each hole must have a unique handicap index" };
  }

  const totalPar = validated.holes.reduce((sum, h) => sum + h.par, 0);

  // Build a map of existing holes by holeNumber for upsert logic
  const existingHoleMap = new Map(existing.holes.map((h) => [h.holeNumber, h.id]));
  const inputHoleNumbers = new Set(validated.holes.map((h) => h.holeNumber));

  // Find holes to remove (exist in DB but not in input, e.g. 18 -> 9)
  const holesToRemove = existing.holes.filter((h) => !inputHoleNumbers.has(h.holeNumber));

  const course = await prisma.$transaction(async (tx) => {
    // Remove excess holes (check for FK constraint from HoleScore)
    if (holesToRemove.length > 0) {
      const holeIdsToRemove = holesToRemove.map((h) => h.id);
      const referencedScores = await tx.holeScore.count({
        where: { holeId: { in: holeIdsToRemove } },
      });
      if (referencedScores > 0) {
        throw new UserError(
          `Cannot remove holes ${holesToRemove.map((h) => h.holeNumber).join(", ")} because they have recorded scores. Delete those scorecards first.`
        );
      }
      await tx.hole.deleteMany({ where: { id: { in: holeIdsToRemove } } });
    }

    // Upsert each hole: update existing, create new
    for (const h of validated.holes) {
      const existingId = existingHoleMap.get(h.holeNumber);
      if (existingId) {
        await tx.hole.update({
          where: { id: existingId },
          data: {
            par: h.par,
            handicapIndex: h.handicapIndex,
            yardage: h.yardage ?? null,
          },
        });
      } else {
        await tx.hole.create({
          data: {
            courseId,
            holeNumber: h.holeNumber,
            par: h.par,
            handicapIndex: h.handicapIndex,
            yardage: h.yardage ?? null,
          },
        });
      }
    }

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
