import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { prisma } from "./db";
import { getSessionSecret } from "./session-secret";

export interface SuperAdminSession {
  superAdminId: number;
  username: string;
}

/**
 * Parse the super-admin session from the cookie.
 * Verifies the JWT signature before trusting the payload.
 * Returns null if no valid session exists.
 */
export async function getSuperAdminSession(): Promise<SuperAdminSession | null> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get("sudo_session")?.value;

  if (!sessionCookie) {
    return null;
  }

  try {
    const secret = getSessionSecret();
    const { payload } = await jwtVerify(sessionCookie, secret, {
      algorithms: ["HS256"],
      issuer: "leaguelinks",
      audience: "sudo",
    });

    const superAdminId = payload.superAdminId;
    const username = payload.username;

    if (typeof superAdminId !== "number" || typeof username !== "string") {
      return null;
    }

    if (!superAdminId || !username) {
      return null;
    }

    const session: SuperAdminSession = { superAdminId, username };
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
 * Create a signed JWT session token for the super-admin.
 */
export async function createSuperAdminSessionToken(session: SuperAdminSession): Promise<string> {
  const secret = getSessionSecret();

  return new SignJWT({
    superAdminId: session.superAdminId,
    username: session.username,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("4h")
    .setIssuer("leaguelinks")
    .setAudience("sudo")
    .sign(secret);
}

/**
 * Verify a super-admin JWT token and return the session payload.
 * Used by middleware where cookies() is not available.
 */
export async function verifySuperAdminSessionToken(token: string): Promise<SuperAdminSession | null> {
  try {
    const secret = getSessionSecret();
    const { payload } = await jwtVerify(token, secret, {
      algorithms: ["HS256"],
      issuer: "leaguelinks",
      audience: "sudo",
    });

    const superAdminId = payload.superAdminId;
    const username = payload.username;

    if (typeof superAdminId !== "number" || typeof username !== "string") {
      return null;
    }

    if (!superAdminId || !username) {
      return null;
    }

    const session: SuperAdminSession = { superAdminId, username };
    return session;
  } catch {
    return null;
  }
}

/**
 * Validate super-admin credentials against the database.
 * Uses bcrypt to compare the password hash.
 */
export async function validateSuperAdminCredentials(
  username: string,
  password: string
): Promise<{ valid: boolean; superAdminId?: number }> {
  const admin = await prisma.superAdmin.findUnique({
    where: { username },
  });

  if (!admin) {
    // Constant-time comparison to prevent timing attacks — use a valid bcrypt hash
    await bcrypt.compare(password, "$2a$12$4tdsSuOvxPn843EZvlpMlO9g7WbsIphMfgilddhwRLuGiaCwcClIe");
    return { valid: false };
  }

  const passwordValid = await bcrypt.compare(password, admin.password);
  if (!passwordValid) {
    return { valid: false };
  }

  return { valid: true, superAdminId: admin.id };
}
