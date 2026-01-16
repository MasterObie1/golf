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
      include: {
        _count: {
          select: {
            teams: true,
            matchups: true,
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
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

// DELETE /api/sudo/leagues/[id] - Delete league
export async function DELETE(
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

    // Delete the league (cascade will handle teams and matchups)
    await prisma.league.delete({
      where: { id: leagueId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete league error:", error);
    return NextResponse.json(
      { error: "Failed to delete league" },
      { status: 500 }
    );
  }
}
