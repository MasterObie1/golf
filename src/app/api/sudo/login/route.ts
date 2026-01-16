import { NextResponse } from "next/server";
import {
  validateSuperAdminCredentials,
  createSuperAdminSessionToken,
} from "@/lib/superadmin-auth";

export async function POST(request: Request) {
  try {
    const { username, password } = await request.json();

    // Validate input
    if (!username || !password) {
      return NextResponse.json(
        { error: "Username and password are required" },
        { status: 400 }
      );
    }

    // Validate credentials
    const result = await validateSuperAdminCredentials(username, password);

    if (!result.valid || !result.superAdminId) {
      return NextResponse.json(
        { error: "Invalid credentials" },
        { status: 401 }
      );
    }

    // Create session token
    const sessionToken = createSuperAdminSessionToken({
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
