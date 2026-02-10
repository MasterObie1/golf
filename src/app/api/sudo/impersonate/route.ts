import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/superadmin-auth";
import { SignJWT } from "jose";
import { z } from "zod";

const impersonateSchema = z.object({
  leagueId: z.number().int().positive(),
});

// POST /api/sudo/impersonate - Login as a league admin
export async function POST(request: Request) {
  try {
    const session = await requireSuperAdmin();

    const body = await request.json();
    const parsed = impersonateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid league ID" },
        { status: 400 }
      );
    }

    const { leagueId } = parsed.data;

    // Get the league (only fields needed for session)
    const league = await prisma.league.findUnique({
      where: { id: leagueId },
      select: { id: true, slug: true, adminUsername: true },
    });

    if (!league) {
      return NextResponse.json({ error: "League not found" }, { status: 404 });
    }

    // Create a signed JWT admin session with impersonation marker
    const secret = new TextEncoder().encode(process.env.SESSION_SECRET!);
    const sessionToken = await new SignJWT({
      leagueId: league.id,
      leagueSlug: league.slug,
      adminUsername: league.adminUsername,
      impersonatedBy: session.username,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("1h") // Shorter expiry for impersonation
      .setAudience("admin")
      .sign(secret);

    // Log the impersonation for audit purposes
    console.warn(
      `[AUDIT] Super-admin "${session.username}" (id=${session.superAdminId}) impersonated league "${league.slug}" (id=${league.id})`
    );

    // Set the admin_session cookie
    const response = NextResponse.json({
      success: true,
      leagueSlug: league.slug,
    });

    response.cookies.set("admin_session", sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 60 * 60, // 1 hour (much shorter than normal admin session)
      path: "/",
    });

    return response;
  } catch (error) {
    console.error("Impersonate error:", error);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
