import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { getSessionSecret } from "./session-secret";

export interface AdminSession {
  leagueId: number;
  leagueSlug: string;
  adminUsername: string;
}

/**
 * Parse the admin session from the cookie.
 * Verifies the JWT signature before trusting the payload.
 * Returns null if no valid session exists.
 */
export async function getAdminSession(): Promise<AdminSession | null> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get("admin_session")?.value;

  if (!sessionCookie) {
    return null;
  }

  try {
    const secret = getSessionSecret();
    const { payload } = await jwtVerify(sessionCookie, secret, {
      algorithms: ["HS256"],
      issuer: "leaguelinks",
      audience: "admin",
    });

    const leagueId = payload.leagueId;
    const leagueSlug = payload.leagueSlug;
    const adminUsername = payload.adminUsername;

    if (typeof leagueId !== "number" || typeof leagueSlug !== "string" || typeof adminUsername !== "string") {
      return null;
    }

    if (!leagueId || !leagueSlug || !adminUsername) {
      return null;
    }

    const session: AdminSession = { leagueId, leagueSlug, adminUsername };
    return session;
  } catch {
    return null;
  }
}

/**
 * Check if the current request is from an authenticated admin.
 * Used by server actions to verify authorization.
 *
 * @throws Error if not authorized
 */
export async function requireAdmin(): Promise<AdminSession> {
  const session = await getAdminSession();

  if (!session) {
    throw new Error("Unauthorized: Please log in to access admin features");
  }

  return session;
}

/**
 * Require admin access for a specific league.
 * Verifies the admin is logged in AND has access to the specified league.
 *
 * @throws Error if not authorized for this league
 */
export async function requireLeagueAdmin(leagueSlug: string): Promise<AdminSession> {
  const session = await requireAdmin();

  if (session.leagueSlug !== leagueSlug) {
    throw new Error("Unauthorized: You do not have access to this league");
  }

  return session;
}

/**
 * Check if the current request is from an authenticated admin.
 * Returns boolean instead of throwing.
 */
export async function isAdmin(): Promise<boolean> {
  const session = await getAdminSession();
  return session !== null;
}

/**
 * Check if the current user is admin for a specific league.
 */
export async function isLeagueAdmin(leagueSlug: string): Promise<boolean> {
  const session = await getAdminSession();
  return session !== null && session.leagueSlug === leagueSlug;
}

/**
 * Create a signed JWT session token for the given league admin.
 */
export async function createSessionToken(session: AdminSession): Promise<string> {
  const secret = getSessionSecret();

  return new SignJWT({
    leagueId: session.leagueId,
    leagueSlug: session.leagueSlug,
    adminUsername: session.adminUsername,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("24h")
    .setIssuer("leaguelinks")
    .setAudience("admin")
    .sign(secret);
}

/**
 * Verify a JWT token and return the session payload.
 * Used by middleware where cookies() is not available.
 */
export async function verifySessionToken(token: string): Promise<AdminSession | null> {
  try {
    const secret = getSessionSecret();
    const { payload } = await jwtVerify(token, secret, {
      algorithms: ["HS256"],
      issuer: "leaguelinks",
      audience: "admin",
    });

    const leagueId = payload.leagueId;
    const leagueSlug = payload.leagueSlug;
    const adminUsername = payload.adminUsername;

    if (typeof leagueId !== "number" || typeof leagueSlug !== "string" || typeof adminUsername !== "string") {
      return null;
    }

    if (!leagueId || !leagueSlug || !adminUsername) {
      return null;
    }

    const session: AdminSession = { leagueId, leagueSlug, adminUsername };
    return session;
  } catch {
    return null;
  }
}
