import { NextResponse } from "next/server";
import {
  validateSuperAdminCredentials,
  createSuperAdminSessionToken,
} from "@/lib/superadmin-auth";
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

    // Rate limit check — stricter for super-admin
    const ip = getClientIp(request);
    const rateCheck = checkRateLimit(`sudo-login:${ip}`, RATE_LIMITS.sudoLogin);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: "Too many login attempts. Please try again later." },
        { status: 429, headers: { "Retry-After": String(Math.ceil((rateCheck.resetAt - Date.now()) / 1000)) } }
      );
    }

    const { username, password } = await request.json();

    // Validate input
    if (!username || !password) {
      return NextResponse.json(
        { error: "Username and password are required" },
        { status: 400 }
      );
    }

    // Validate credentials against database
    const result = await validateSuperAdminCredentials(username, password);

    if (!result.valid || !result.superAdminId) {
      return NextResponse.json(
        { error: "Invalid credentials" },
        { status: 401 }
      );
    }

    // Create signed JWT session token
    const sessionToken = await createSuperAdminSessionToken({
      superAdminId: result.superAdminId,
      username,
    });

    // Set cookie and return success
    const response = NextResponse.json({
      success: true,
    });

    response.cookies.set("sudo_session", sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 60 * 60 * 4, // 4 hours
      path: "/",
    });

    return response;
  } catch (error) {
    console.error("Super-admin login error:", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json({ error: "An error occurred" }, { status: 500 });
  }
}
