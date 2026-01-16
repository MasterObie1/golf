import { cookies } from "next/headers";

export interface AdminSession {
  leagueId: number;
  leagueSlug: string;
  adminUsername: string;
}

/**
 * Parse the admin session from the cookie.
 * Returns null if no valid session exists.
 */
export async function getAdminSession(): Promise<AdminSession | null> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get("admin_session")?.value;

  if (!sessionCookie) {
    return null;
  }

  try {
    const decoded = Buffer.from(sessionCookie, "base64").toString("utf-8");
    const session = JSON.parse(decoded) as AdminSession;

    // Validate session structure
    if (!session.leagueId || !session.leagueSlug || !session.adminUsername) {
      return null;
    }

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
 * Create a session token for the given league admin.
 */
export function createSessionToken(session: AdminSession): string {
  return Buffer.from(JSON.stringify(session)).toString("base64");
}
