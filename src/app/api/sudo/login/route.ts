import { NextResponse } from "next/server";
import {
  validateSuperAdminCredentials,
  createSuperAdminSessionToken,
} from "@/lib/superadmin-auth";
import { checkRateLimit, getClientIp, RATE_LIMITS } from "@/lib/rate-limit";

export async function POST(request: Request) {
  try {
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
      maxAge: 60 * 60 * 24 * 7, // 1 week
      path: "/",
    });

    return response;
  } catch (error) {
    console.error("Super-admin login error:", error);
    return NextResponse.json({ error: "An error occurred" }, { status: 500 });
  }
}
