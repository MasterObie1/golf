import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { createSessionToken } from "@/lib/auth";
import { checkRateLimit, getClientIp, RATE_LIMITS } from "@/lib/rate-limit";

export async function POST(request: Request) {
  try {
    // CSRF: verify Origin header matches our host
    const origin = request.headers.get("origin");
    const host = request.headers.get("host");
    if (origin && host) {
      try {
        const originHost = new URL(origin).host;
        if (originHost !== host) {
          return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
      } catch {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

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
      // Timing attack mitigation: perform a dummy bcrypt compare so the response
      // time is indistinguishable from a real password check.
      await bcrypt.compare(password, "$2a$12$4tdsSuOvxPn843EZvlpMlO9g7WbsIphMfgilddhwRLuGiaCwcClIe");
      return NextResponse.json(
        { error: "Invalid credentials" },
        { status: 401 }
      );
    }

    // Compare password with hashed password
    const passwordValid = await bcrypt.compare(password, league.adminPassword);
    if (!passwordValid) {
      return NextResponse.json(
        { error: "Invalid credentials" },
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
      maxAge: 60 * 60 * 24, // 24 hours
      path: "/",
    });

    return response;
  } catch (error) {
    console.error("Login error:", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json(
      { error: "An error occurred" },
      { status: 500 }
    );
  }
}
