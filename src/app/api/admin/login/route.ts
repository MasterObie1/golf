import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { createSessionToken } from "@/lib/auth";
import { checkRateLimit, getClientIp, RATE_LIMITS } from "@/lib/rate-limit";

export async function POST(request: Request) {
  try {
    // Rate limit check
    const ip = getClientIp(request);
    const rateCheck = checkRateLimit(`admin-login:${ip}`, RATE_LIMITS.login);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: "Too many login attempts. Please try again later." },
        { status: 429, headers: { "Retry-After": String(Math.ceil((rateCheck.resetAt - Date.now()) / 1000)) } }
      );
    }

    const { password, leagueSlug } = await request.json();

    // Validate input
    if (!password || !leagueSlug) {
      return NextResponse.json(
        { error: "Password and league are required" },
        { status: 400 }
      );
    }

    // Find the league by slug — only fetch auth fields
    const league = await prisma.league.findUnique({
      where: { slug: leagueSlug },
      select: {
        id: true,
        slug: true,
        name: true,
        adminUsername: true,
        adminPassword: true,
      },
    });

    if (!league) {
      return NextResponse.json(
        { error: "League not found" },
        { status: 404 }
      );
    }

    // Compare password with hashed password
    const passwordValid = await bcrypt.compare(password, league.adminPassword);
    if (!passwordValid) {
      return NextResponse.json(
        { error: "Invalid password" },
        { status: 401 }
      );
    }

    // Create signed JWT session token
    const sessionToken = await createSessionToken({
      leagueId: league.id,
      leagueSlug: league.slug,
      adminUsername: league.adminUsername,
    });

    // Set cookie and return success
    const response = NextResponse.json({
      success: true,
      leagueSlug: league.slug,
      leagueName: league.name,
    });

    response.cookies.set("admin_session", sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 60 * 60 * 24 * 7, // 1 week
      path: "/",
    });

    return response;
  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.json(
      { error: "An error occurred" },
      { status: 500 }
    );
  }
}
