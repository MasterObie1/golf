import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/superadmin-auth";

// GET /api/sudo/leagues/[id] - Get league details
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireSuperAdmin();

    const { id } = await params;
    const leagueId = parseInt(id);

    if (isNaN(leagueId)) {
      return NextResponse.json({ error: "Invalid league ID" }, { status: 400 });
    }

    const league = await prisma.league.findUnique({
      where: { id: leagueId },
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        maxTeams: true,
        registrationOpen: true,
        scoringType: true,
        courseName: true,
        courseLocation: true,
        playDay: true,
        playTime: true,
        description: true,
        contactEmail: true,
        contactPhone: true,
        startDate: true,
        endDate: true,
        numberOfWeeks: true,
        entryFee: true,
        prizeInfo: true,
        createdAt: true,
        updatedAt: true,
        scorecardMode: true,
        scorecardRequireApproval: true,
        scheduleType: true,
        _count: {
          select: {
            teams: true,
            matchups: true,
            scheduledMatchups: true,
          },
        },
      },
    });

    if (!league) {
      return NextResponse.json({ error: "League not found" }, { status: 404 });
    }

    return NextResponse.json(league);
  } catch (error) {
    console.error("Get league error:", error);
    if (error instanceof Error && error.message.includes("Unauthorized")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Failed to fetch league" }, { status: 500 });
  }
}

// DELETE /api/sudo/leagues/[id] - Delete league
// Uses explicit cleanup to avoid cascade failures on Restrict relations.
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireSuperAdmin();

    const { id } = await params;
    const leagueId = parseInt(id);

    if (isNaN(leagueId)) {
      return NextResponse.json({ error: "Invalid league ID" }, { status: 400 });
    }

    // Verify league exists before attempting delete
    const league = await prisma.league.findUnique({
      where: { id: leagueId },
      select: { id: true, slug: true, name: true },
    });

    if (!league) {
      return NextResponse.json({ error: "League not found" }, { status: 404 });
    }

    // Explicit cleanup in correct order to avoid FK constraint failures.
    // ScheduledMatchup.teamA/teamB and WeeklyScore.team use onDelete: Restrict,
    // so deleting teams via cascade would fail if these records exist.
    await prisma.$transaction(async (tx) => {
      // 1. Delete hole scores (via scorecards)
      await tx.holeScore.deleteMany({
        where: { scorecard: { leagueId } },
      });
      // 2. Delete scorecards
      await tx.scorecard.deleteMany({ where: { leagueId } });
      // 3. Delete weekly scores (Restrict on team)
      await tx.weeklyScore.deleteMany({ where: { leagueId } });
      // 4. Delete scheduled matchups (Restrict on teamA/teamB)
      await tx.scheduledMatchup.deleteMany({ where: { leagueId } });
      // 5. Delete matchups
      await tx.matchup.deleteMany({ where: { leagueId } });
      // 6. Delete teams
      await tx.team.deleteMany({ where: { leagueId } });
      // 7. Delete holes (via courses)
      await tx.hole.deleteMany({
        where: { course: { leagueId } },
      });
      // 8. Delete courses
      await tx.course.deleteMany({ where: { leagueId } });
      // 9. Delete seasons
      await tx.season.deleteMany({ where: { leagueId } });
      // 10. Delete the league itself
      await tx.league.delete({ where: { id: leagueId } });
    });

    // Audit log
    console.warn(
      `[AUDIT] Super-admin "${session.username}" (id=${session.superAdminId}) deleted league "${league.name}" (slug=${league.slug}, id=${league.id})`
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete league error:", error);
    return NextResponse.json(
      { error: "Failed to delete league" },
      { status: 500 }
    );
  }
}
