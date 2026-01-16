import { cookies } from "next/headers";

export interface SuperAdminSession {
  superAdminId: number;
  username: string;
}

// Hardcoded credentials for now - change later to env vars or DB lookup
const SUPER_ADMIN_USERNAME = "alex";
const SUPER_ADMIN_PASSWORD = "sudo123!";

/**
 * Parse the super-admin session from the cookie.
 * Returns null if no valid session exists.
 */
export async function getSuperAdminSession(): Promise<SuperAdminSession | null> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get("sudo_session")?.value;

  if (!sessionCookie) {
    return null;
  }

  try {
    const decoded = Buffer.from(sessionCookie, "base64").toString("utf-8");
    const session = JSON.parse(decoded) as SuperAdminSession;

    // Validate session structure
    if (!session.superAdminId || !session.username) {
      return null;
    }

    return session;
  } catch {
    return null;
  }
}

/**
 * Check if the current request is from an authenticated super-admin.
 * Used by server actions to verify authorization.
 *
 * @throws Error if not authorized
 */
export async function requireSuperAdmin(): Promise<SuperAdminSession> {
  const session = await getSuperAdminSession();

  if (!session) {
    throw new Error("Unauthorized: Super-admin access required");
  }

  return session;
}

/**
 * Check if the current request is from an authenticated super-admin.
 * Returns boolean instead of throwing.
 */
export async function isSuperAdmin(): Promise<boolean> {
  const session = await getSuperAdminSession();
  return session !== null;
}

/**
 * Create a session token for the super-admin.
 */
export function createSuperAdminSessionToken(session: SuperAdminSession): string {
  return Buffer.from(JSON.stringify(session)).toString("base64");
}

/**
 * Validate super-admin credentials.
 * For now, uses hardcoded credentials. Later can be switched to DB lookup.
 */
export async function validateSuperAdminCredentials(
  username: string,
  password: string
): Promise<{ valid: boolean; superAdminId?: number }> {
  // Hardcoded validation for now
  if (username === SUPER_ADMIN_USERNAME && password === SUPER_ADMIN_PASSWORD) {
    return { valid: true, superAdminId: 1 };
  }
  return { valid: false };
}
