import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/superadmin-auth";
import { createSessionToken } from "@/lib/auth";

// POST /api/sudo/impersonate - Login as a league admin
export async function POST(request: Request) {
  try {
    await requireSuperAdmin();

    const { leagueId } = await request.json();

    if (!leagueId) {
      return NextResponse.json(
        { error: "League ID is required" },
        { status: 400 }
      );
    }

    // Get the league
    const league = await prisma.league.findUnique({
      where: { id: leagueId },
    });

    if (!league) {
      return NextResponse.json({ error: "League not found" }, { status: 404 });
    }

    // Create an admin session for this league
    const sessionToken = createSessionToken({
      leagueId: league.id,
      leagueSlug: league.slug,
      adminUsername: league.adminUsername,
    });

    // Set the admin_session cookie
    const response = NextResponse.json({
      success: true,
      leagueSlug: league.slug,
    });

    response.cookies.set("admin_session", sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 60 * 60 * 24, // 1 day (shorter than normal admin session)
      path: "/",
    });

    return response;
  } catch (error) {
    console.error("Impersonate error:", error);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
