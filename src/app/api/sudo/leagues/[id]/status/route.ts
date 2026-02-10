import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/superadmin-auth";

// PATCH /api/sudo/leagues/[id]/status - Update league status
export async function PATCH(
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

    const { status } = await request.json();

    // Validate status
    const validStatuses = ["active", "suspended", "cancelled"];
    if (!validStatuses.includes(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    // Verify league exists
    const existing = await prisma.league.findUnique({
      where: { id: leagueId },
      select: { id: true, name: true, slug: true, status: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "League not found" }, { status: 404 });
    }

    const league = await prisma.league.update({
      where: { id: leagueId },
      data: { status },
      select: { id: true, name: true, slug: true, status: true },
    });

    // Audit log
    console.warn(
      `[AUDIT] Super-admin "${session.username}" (id=${session.superAdminId}) changed league "${existing.name}" (id=${existing.id}) status: ${existing.status} -> ${status}`
    );

    return NextResponse.json(league);
  } catch (error) {
    console.error("Update league status error:", error);
    return NextResponse.json(
      { error: "Failed to update status" },
      { status: 500 }
    );
  }
}
