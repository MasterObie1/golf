import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/superadmin-auth";

// PATCH /api/sudo/leagues/[id]/status - Update league status
export async function PATCH(
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

    const { status } = await request.json();

    // Validate status
    const validStatuses = ["active", "suspended", "cancelled"];
    if (!validStatuses.includes(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    const league = await prisma.league.update({
      where: { id: leagueId },
      data: { status },
    });

    return NextResponse.json(league);
  } catch (error) {
    console.error("Update league status error:", error);
    return NextResponse.json(
      { error: "Failed to update status" },
      { status: 500 }
    );
  }
}
