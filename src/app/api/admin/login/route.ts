import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { createSessionToken } from "@/lib/auth";

export async function POST(request: Request) {
  try {
    const { username, password, leagueSlug } = await request.json();

    // Validate input
    if (!username || !password || !leagueSlug) {
      return NextResponse.json(
        { error: "Username, password, and league are required" },
        { status: 400 }
      );
    }

    // Find the league by slug
    const league = await prisma.league.findUnique({
      where: { slug: leagueSlug },
    });

    if (!league) {
      return NextResponse.json(
        { error: "League not found" },
        { status: 404 }
      );
    }

    // Validate credentials
    if (username !== league.adminUsername) {
      return NextResponse.json(
        { error: "Invalid username or password" },
        { status: 401 }
      );
    }

    // Compare password with hashed password
    const passwordValid = await bcrypt.compare(password, league.adminPassword);
    if (!passwordValid) {
      return NextResponse.json(
        { error: "Invalid username or password" },
        { status: 401 }
      );
    }

    // Create session token
    const sessionToken = createSessionToken({
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
