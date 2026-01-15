import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Middleware to protect admin routes.
 * Uses a simple token-based authentication via cookie.
 *
 * To access admin:
 * 1. Set ADMIN_SECRET in your .env file
 * 2. Navigate to /admin?token=YOUR_SECRET to authenticate
 * 3. The token is stored in a cookie for subsequent requests
 */
export function middleware(request: NextRequest) {
  // Only protect /admin routes
  if (!request.nextUrl.pathname.startsWith("/admin")) {
    return NextResponse.next();
  }

  const adminSecret = process.env.ADMIN_SECRET;

  // If no admin secret is configured, block admin access entirely in production
  if (!adminSecret) {
    if (process.env.NODE_ENV === "production") {
      return new NextResponse("Admin access not configured", { status: 403 });
    }
    // In development, allow access without auth for convenience
    return NextResponse.next();
  }

  // Check for token in URL query param (for initial auth)
  const tokenParam = request.nextUrl.searchParams.get("token");
  if (tokenParam === adminSecret) {
    // Valid token in URL - set cookie and redirect to clean URL
    const response = NextResponse.redirect(new URL("/admin", request.url));
    response.cookies.set("admin_token", adminSecret, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 60 * 60 * 24 * 7, // 1 week
    });
    return response;
  }

  // Check for valid token in cookie
  const cookieToken = request.cookies.get("admin_token")?.value;
  if (cookieToken === adminSecret) {
    return NextResponse.next();
  }

  // No valid auth - return 401
  return new NextResponse("Unauthorized. Access /admin?token=YOUR_SECRET to authenticate.", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Bearer realm="admin"',
    },
  });
}

export const config = {
  matcher: "/admin/:path*",
};
