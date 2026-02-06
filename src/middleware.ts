import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

interface AdminSession {
  leagueId: number;
  leagueSlug: string;
  adminUsername: string;
}

interface SuperAdminSession {
  superAdminId: number;
  username: string;
}

function getSessionSecret(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    // In middleware, we can't throw — just return empty to deny all sessions
    return new Uint8Array(0);
  }
  return new TextEncoder().encode(secret);
}

/**
 * Parse and verify admin session JWT from cookie in middleware context.
 */
async function parseSession(cookie: string | undefined): Promise<AdminSession | null> {
  if (!cookie) return null;

  try {
    const secret = getSessionSecret();
    if (secret.length === 0) return null;

    const { payload } = await jwtVerify(cookie, secret, {
      algorithms: ["HS256"],
    });

    const session: AdminSession = {
      leagueId: payload.leagueId as number,
      leagueSlug: payload.leagueSlug as string,
      adminUsername: payload.adminUsername as string,
    };

    if (!session.leagueId || !session.leagueSlug || !session.adminUsername) {
      return null;
    }

    return session;
  } catch {
    return null;
  }
}

/**
 * Parse and verify super-admin session JWT from cookie in middleware context.
 */
async function parseSuperAdminSession(cookie: string | undefined): Promise<SuperAdminSession | null> {
  if (!cookie) return null;

  try {
    const secret = getSessionSecret();
    if (secret.length === 0) return null;

    const { payload } = await jwtVerify(cookie, secret, {
      algorithms: ["HS256"],
    });

    const session: SuperAdminSession = {
      superAdminId: payload.superAdminId as number,
      username: payload.username as string,
    };

    if (!session.superAdminId || !session.username) {
      return null;
    }

    return session;
  } catch {
    return null;
  }
}

/**
 * Middleware to protect league admin routes and super-admin routes.
 * Redirects unauthenticated users to the appropriate login page.
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow access to API routes
  if (pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  // Check if this is a super-admin route: /sudo/*
  if (pathname.startsWith("/sudo")) {
    // Allow access to login page
    if (pathname === "/sudo/login") {
      return NextResponse.next();
    }

    // Check for valid super-admin session
    const sudoSessionCookie = request.cookies.get("sudo_session")?.value;
    const sudoSession = await parseSuperAdminSession(sudoSessionCookie);

    if (!sudoSession) {
      // No session - redirect to sudo login
      const loginUrl = new URL("/sudo/login", request.url);
      return NextResponse.redirect(loginUrl);
    }

    // Session valid - allow access
    return NextResponse.next();
  }

  // Check if this is a league admin route: /league/:slug/admin
  const leagueAdminMatch = pathname.match(/^\/league\/([^/]+)\/admin(?:\/.*)?$/);

  if (leagueAdminMatch) {
    const leagueSlug = leagueAdminMatch[1];

    // Allow access to login page
    if (pathname === `/league/${leagueSlug}/admin/login`) {
      return NextResponse.next();
    }

    // Check for valid session cookie
    const sessionCookie = request.cookies.get("admin_session")?.value;
    const session = await parseSession(sessionCookie);

    if (!session) {
      // No session - redirect to league's login page
      const loginUrl = new URL(`/league/${leagueSlug}/admin/login`, request.url);
      return NextResponse.redirect(loginUrl);
    }

    // Verify the session is for this specific league
    if (session.leagueSlug !== leagueSlug) {
      // Logged into different league - redirect to this league's login
      const loginUrl = new URL(`/league/${leagueSlug}/admin/login`, request.url);
      return NextResponse.redirect(loginUrl);
    }

    // Session valid for this league - allow access
    return NextResponse.next();
  }

  // Handle old /admin routes - redirect to leagues page
  if (pathname.startsWith("/admin")) {
    const leaguesUrl = new URL("/leagues", request.url);
    return NextResponse.redirect(leaguesUrl);
  }

  // All other routes - allow access
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/admin/:path*",
    "/league/:path*/admin/:path*",
    "/api/admin/:path*",
    "/sudo/:path*",
  ],
};
