import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SignJWT } from "jose";

const TEST_SECRET = "test-secret-key-at-least-32-chars-long";

// Mock next/headers
vi.mock("next/headers", () => ({
  cookies: vi.fn(),
}));

// Mock @/lib/db
vi.mock("@/lib/db", () => ({
  prisma: {
    superAdmin: {
      findUnique: vi.fn(),
    },
  },
}));

// Mock bcryptjs
vi.mock("bcryptjs", () => ({
  default: {
    compare: vi.fn(),
  },
}));

import {
  getSuperAdminSession,
  requireSuperAdmin,
  isSuperAdmin,
  createSuperAdminSessionToken,
  verifySuperAdminSessionToken,
  validateSuperAdminCredentials,
  type SuperAdminSession,
} from "@/lib/superadmin-auth";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import bcrypt from "bcryptjs";

const mockedCookies = vi.mocked(cookies);
const mockedPrisma = vi.mocked(prisma);
const mockedBcrypt = vi.mocked(bcrypt);

beforeEach(() => {
  process.env.SESSION_SECRET = TEST_SECRET;
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("createSuperAdminSessionToken", () => {
  it("creates a valid JWT string", async () => {
    const session: SuperAdminSession = { superAdminId: 1, username: "admin" };
    const token = await createSuperAdminSessionToken(session);
    expect(typeof token).toBe("string");
    expect(token.split(".")).toHaveLength(3);
  });

  it("encodes session data correctly", async () => {
    const session: SuperAdminSession = { superAdminId: 42, username: "superuser" };
    const token = await createSuperAdminSessionToken(session);
    const result = await verifySuperAdminSessionToken(token);
    expect(result).toEqual(session);
  });

  it("sets 4h expiration", async () => {
    const session: SuperAdminSession = { superAdminId: 1, username: "admin" };
    const token = await createSuperAdminSessionToken(session);
    const secret = new TextEncoder().encode(TEST_SECRET);
    const { payload } = await (await import("jose")).jwtVerify(token, secret, { algorithms: ["HS256"] });
    const now = Math.floor(Date.now() / 1000);
    const fourHours = 4 * 60 * 60;
    expect(payload.exp! - now).toBeGreaterThan(fourHours - 60);
    expect(payload.exp! - now).toBeLessThanOrEqual(fourHours + 1);
  });
});

describe("verifySuperAdminSessionToken", () => {
  it("decodes payload from valid token", async () => {
    const session: SuperAdminSession = { superAdminId: 5, username: "boss" };
    const token = await createSuperAdminSessionToken(session);
    const result = await verifySuperAdminSessionToken(token);
    expect(result).toEqual(session);
  });

  it("returns null for expired token", async () => {
    const secret = new TextEncoder().encode(TEST_SECRET);
    const token = await new SignJWT({ superAdminId: 1, username: "admin" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt(Math.floor(Date.now() / 1000) - 86400)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 3600)
      .setIssuer("leaguelinks")
      .setAudience("sudo")
      .sign(secret);

    const result = await verifySuperAdminSessionToken(token);
    expect(result).toBeNull();
  });

  it("returns null for wrong secret", async () => {
    const wrongSecret = new TextEncoder().encode("wrong-secret-that-is-at-least-32chars");
    const token = await new SignJWT({ superAdminId: 1, username: "admin" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("4h")
      .setIssuer("leaguelinks")
      .setAudience("sudo")
      .sign(wrongSecret);

    const result = await verifySuperAdminSessionToken(token);
    expect(result).toBeNull();
  });

  it("returns null for wrong audience", async () => {
    const secret = new TextEncoder().encode(TEST_SECRET);
    const token = await new SignJWT({ superAdminId: 1, username: "admin" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("4h")
      .setIssuer("leaguelinks")
      .setAudience("admin") // wrong
      .sign(secret);

    const result = await verifySuperAdminSessionToken(token);
    expect(result).toBeNull();
  });

  it("returns null for non-number superAdminId", async () => {
    const secret = new TextEncoder().encode(TEST_SECRET);
    const token = await new SignJWT({ superAdminId: "not-number", username: "admin" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("4h")
      .setIssuer("leaguelinks")
      .setAudience("sudo")
      .sign(secret);

    const result = await verifySuperAdminSessionToken(token);
    expect(result).toBeNull();
  });

  it("returns null for empty username", async () => {
    const secret = new TextEncoder().encode(TEST_SECRET);
    const token = await new SignJWT({ superAdminId: 1, username: "" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("4h")
      .setIssuer("leaguelinks")
      .setAudience("sudo")
      .sign(secret);

    const result = await verifySuperAdminSessionToken(token);
    expect(result).toBeNull();
  });

  it("returns null for invalid token string", async () => {
    const result = await verifySuperAdminSessionToken("garbage");
    expect(result).toBeNull();
  });
});

describe("getSuperAdminSession", () => {
  it("returns session from valid cookie", async () => {
    const session: SuperAdminSession = { superAdminId: 1, username: "admin" };
    const token = await createSuperAdminSessionToken(session);

    mockedCookies.mockResolvedValue({
      get: (name: string) => (name === "sudo_session" ? { value: token } : undefined),
    } as unknown as Awaited<ReturnType<typeof cookies>>);

    const result = await getSuperAdminSession();
    expect(result).toEqual(session);
  });

  it("returns null when no cookie exists", async () => {
    mockedCookies.mockResolvedValue({
      get: () => undefined,
    } as unknown as Awaited<ReturnType<typeof cookies>>);

    const result = await getSuperAdminSession();
    expect(result).toBeNull();
  });

  it("returns null for invalid cookie value", async () => {
    mockedCookies.mockResolvedValue({
      get: (name: string) => (name === "sudo_session" ? { value: "bad-jwt" } : undefined),
    } as unknown as Awaited<ReturnType<typeof cookies>>);

    const result = await getSuperAdminSession();
    expect(result).toBeNull();
  });
});

describe("requireSuperAdmin", () => {
  it("returns session when valid", async () => {
    const session: SuperAdminSession = { superAdminId: 1, username: "admin" };
    const token = await createSuperAdminSessionToken(session);

    mockedCookies.mockResolvedValue({
      get: (name: string) => (name === "sudo_session" ? { value: token } : undefined),
    } as unknown as Awaited<ReturnType<typeof cookies>>);

    const result = await requireSuperAdmin();
    expect(result).toEqual(session);
  });

  it("throws when no session", async () => {
    mockedCookies.mockResolvedValue({
      get: () => undefined,
    } as unknown as Awaited<ReturnType<typeof cookies>>);

    await expect(requireSuperAdmin()).rejects.toThrow("Unauthorized");
  });
});

describe("isSuperAdmin", () => {
  it("returns true when authenticated", async () => {
    const token = await createSuperAdminSessionToken({ superAdminId: 1, username: "admin" });
    mockedCookies.mockResolvedValue({
      get: (name: string) => (name === "sudo_session" ? { value: token } : undefined),
    } as unknown as Awaited<ReturnType<typeof cookies>>);

    expect(await isSuperAdmin()).toBe(true);
  });

  it("returns false when not authenticated", async () => {
    mockedCookies.mockResolvedValue({
      get: () => undefined,
    } as unknown as Awaited<ReturnType<typeof cookies>>);

    expect(await isSuperAdmin()).toBe(false);
  });
});

describe("validateSuperAdminCredentials", () => {
  it("returns valid for correct credentials", async () => {
    mockedPrisma.superAdmin.findUnique.mockResolvedValue({
      id: 1,
      username: "admin",
      password: "$2a$12$hashedpassword",
      createdAt: new Date(),
    } as never);
    mockedBcrypt.compare.mockResolvedValue(true as never);

    const result = await validateSuperAdminCredentials("admin", "correct-password");
    expect(result.valid).toBe(true);
    expect(result.superAdminId).toBe(1);
  });

  it("returns invalid for wrong password", async () => {
    mockedPrisma.superAdmin.findUnique.mockResolvedValue({
      id: 1,
      username: "admin",
      password: "$2a$12$hashedpassword",
      createdAt: new Date(),
    } as never);
    mockedBcrypt.compare.mockResolvedValue(false as never);

    const result = await validateSuperAdminCredentials("admin", "wrong-password");
    expect(result.valid).toBe(false);
    expect(result.superAdminId).toBeUndefined();
  });

  it("returns invalid for non-existent user (constant-time)", async () => {
    mockedPrisma.superAdmin.findUnique.mockResolvedValue(null);
    mockedBcrypt.compare.mockResolvedValue(false as never);

    const result = await validateSuperAdminCredentials("nonexistent", "password");
    expect(result.valid).toBe(false);
    // Should still call bcrypt.compare for timing attack prevention
    expect(mockedBcrypt.compare).toHaveBeenCalled();
  });
});
