import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SignJWT, jwtVerify } from "jose";

// We test the JWT functions directly (createSessionToken, verifySessionToken)
// and mock cookies() for getAdminSession/requireAdmin/requireLeagueAdmin

const TEST_SECRET = "test-secret-key-at-least-32-chars-long";

// Mock next/headers before importing auth module
vi.mock("next/headers", () => ({
  cookies: vi.fn(),
}));

import {
  createSessionToken,
  verifySessionToken,
  getAdminSession,
  requireAdmin,
  requireLeagueAdmin,
  isAdmin,
  isLeagueAdmin,
  type AdminSession,
} from "@/lib/auth";
import { cookies } from "next/headers";

const mockedCookies = vi.mocked(cookies);

beforeEach(() => {
  process.env.SESSION_SECRET = TEST_SECRET;
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ==========================================
// createSessionToken
// ==========================================

describe("createSessionToken", () => {
  it("creates a valid JWT token", async () => {
    const session: AdminSession = {
      leagueId: 1,
      leagueSlug: "test-league",
      adminUsername: "admin@TestLeague",
    };

    const token = await createSessionToken(session);
    expect(typeof token).toBe("string");
    expect(token.split(".")).toHaveLength(3); // JWT has 3 parts
  });

  it("encodes session data in the token", async () => {
    const session: AdminSession = {
      leagueId: 42,
      leagueSlug: "my-league",
      adminUsername: "admin@MyLeague",
    };

    const token = await createSessionToken(session);
    const secret = new TextEncoder().encode(TEST_SECRET);
    const { payload } = await jwtVerify(token, secret, { algorithms: ["HS256"] });

    expect(payload.leagueId).toBe(42);
    expect(payload.leagueSlug).toBe("my-league");
    expect(payload.adminUsername).toBe("admin@MyLeague");
  });

  it("sets expiration time", async () => {
    const session: AdminSession = {
      leagueId: 1,
      leagueSlug: "test",
      adminUsername: "admin",
    };

    const token = await createSessionToken(session);
    const secret = new TextEncoder().encode(TEST_SECRET);
    const { payload } = await jwtVerify(token, secret);

    expect(payload.exp).toBeDefined();
    // Expiry should be ~7 days from now
    const now = Math.floor(Date.now() / 1000);
    const sevenDays = 7 * 24 * 60 * 60;
    expect(payload.exp! - now).toBeGreaterThan(sevenDays - 60); // within 60s tolerance
    expect(payload.exp! - now).toBeLessThanOrEqual(sevenDays + 1);
  });

  it("uses HS256 algorithm", async () => {
    const session: AdminSession = {
      leagueId: 1,
      leagueSlug: "test",
      adminUsername: "admin",
    };

    const token = await createSessionToken(session);
    // Decode header (first part of JWT)
    const header = JSON.parse(Buffer.from(token.split(".")[0], "base64url").toString());
    expect(header.alg).toBe("HS256");
  });

  it("throws when SESSION_SECRET is missing", async () => {
    delete process.env.SESSION_SECRET;

    const session: AdminSession = {
      leagueId: 1,
      leagueSlug: "test",
      adminUsername: "admin",
    };

    await expect(createSessionToken(session)).rejects.toThrow("SESSION_SECRET");
  });
});

// ==========================================
// verifySessionToken
// ==========================================

describe("verifySessionToken", () => {
  it("verifies and returns session from valid token", async () => {
    const session: AdminSession = {
      leagueId: 5,
      leagueSlug: "golf-league",
      adminUsername: "admin@GolfLeague",
    };

    const token = await createSessionToken(session);
    const result = await verifySessionToken(token);

    expect(result).toEqual(session);
  });

  it("returns null for tampered token", async () => {
    const session: AdminSession = {
      leagueId: 1,
      leagueSlug: "test",
      adminUsername: "admin",
    };

    const token = await createSessionToken(session);
    // Tamper with the token by flipping a character in the signature
    const parts = token.split(".");
    const sig = parts[2];
    const tamperedSig = sig[0] === "a" ? "b" + sig.slice(1) : "a" + sig.slice(1);
    const tamperedToken = `${parts[0]}.${parts[1]}.${tamperedSig}`;

    const result = await verifySessionToken(tamperedToken);
    expect(result).toBeNull();
  });

  it("returns null for token signed with wrong secret", async () => {
    const secret = new TextEncoder().encode("wrong-secret-key-that-is-different");
    const token = await new SignJWT({ leagueId: 1, leagueSlug: "test", adminUsername: "admin" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("7d")
      .sign(secret);

    const result = await verifySessionToken(token);
    expect(result).toBeNull();
  });

  it("returns null for expired token", async () => {
    const secret = new TextEncoder().encode(TEST_SECRET);
    const token = await new SignJWT({
      leagueId: 1,
      leagueSlug: "test",
      adminUsername: "admin",
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt(Math.floor(Date.now() / 1000) - 86400) // 1 day ago
      .setExpirationTime(Math.floor(Date.now() / 1000) - 3600) // expired 1 hour ago
      .sign(secret);

    const result = await verifySessionToken(token);
    expect(result).toBeNull();
  });

  it("returns null for completely invalid token", async () => {
    const result = await verifySessionToken("not-a-jwt-token");
    expect(result).toBeNull();
  });

  it("returns null for empty token", async () => {
    const result = await verifySessionToken("");
    expect(result).toBeNull();
  });

  it("returns null when session fields are missing from payload", async () => {
    const secret = new TextEncoder().encode(TEST_SECRET);
    // Token with missing leagueSlug
    const token = await new SignJWT({ leagueId: 1, adminUsername: "admin" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("7d")
      .sign(secret);

    const result = await verifySessionToken(token);
    expect(result).toBeNull();
  });
});

// ==========================================
// getAdminSession (requires mocked cookies)
// ==========================================

describe("getAdminSession", () => {
  it("returns session from valid cookie", async () => {
    const session: AdminSession = {
      leagueId: 1,
      leagueSlug: "test-league",
      adminUsername: "admin@TestLeague",
    };

    const token = await createSessionToken(session);

    mockedCookies.mockResolvedValue({
      get: (name: string) => (name === "admin_session" ? { value: token } : undefined),
    } as unknown as Awaited<ReturnType<typeof cookies>>);

    const result = await getAdminSession();
    expect(result).toEqual(session);
  });

  it("returns null when no cookie exists", async () => {
    mockedCookies.mockResolvedValue({
      get: () => undefined,
    } as unknown as Awaited<ReturnType<typeof cookies>>);

    const result = await getAdminSession();
    expect(result).toBeNull();
  });

  it("returns null for invalid cookie value", async () => {
    mockedCookies.mockResolvedValue({
      get: (name: string) =>
        name === "admin_session" ? { value: "invalid-token" } : undefined,
    } as unknown as Awaited<ReturnType<typeof cookies>>);

    const result = await getAdminSession();
    expect(result).toBeNull();
  });
});

// ==========================================
// requireAdmin
// ==========================================

describe("requireAdmin", () => {
  it("returns session when authenticated", async () => {
    const session: AdminSession = {
      leagueId: 1,
      leagueSlug: "test",
      adminUsername: "admin",
    };

    const token = await createSessionToken(session);
    mockedCookies.mockResolvedValue({
      get: (name: string) => (name === "admin_session" ? { value: token } : undefined),
    } as unknown as Awaited<ReturnType<typeof cookies>>);

    const result = await requireAdmin();
    expect(result).toEqual(session);
  });

  it("throws when not authenticated", async () => {
    mockedCookies.mockResolvedValue({
      get: () => undefined,
    } as unknown as Awaited<ReturnType<typeof cookies>>);

    await expect(requireAdmin()).rejects.toThrow("Unauthorized");
  });
});

// ==========================================
// requireLeagueAdmin
// ==========================================

describe("requireLeagueAdmin", () => {
  it("returns session when admin for the correct league", async () => {
    const session: AdminSession = {
      leagueId: 1,
      leagueSlug: "my-league",
      adminUsername: "admin@MyLeague",
    };

    const token = await createSessionToken(session);
    mockedCookies.mockResolvedValue({
      get: (name: string) => (name === "admin_session" ? { value: token } : undefined),
    } as unknown as Awaited<ReturnType<typeof cookies>>);

    const result = await requireLeagueAdmin("my-league");
    expect(result).toEqual(session);
  });

  it("throws when admin for a different league", async () => {
    const session: AdminSession = {
      leagueId: 1,
      leagueSlug: "my-league",
      adminUsername: "admin@MyLeague",
    };

    const token = await createSessionToken(session);
    mockedCookies.mockResolvedValue({
      get: (name: string) => (name === "admin_session" ? { value: token } : undefined),
    } as unknown as Awaited<ReturnType<typeof cookies>>);

    await expect(requireLeagueAdmin("other-league")).rejects.toThrow(
      "Unauthorized: You do not have access to this league"
    );
  });

  it("throws when not authenticated at all", async () => {
    mockedCookies.mockResolvedValue({
      get: () => undefined,
    } as unknown as Awaited<ReturnType<typeof cookies>>);

    await expect(requireLeagueAdmin("any-league")).rejects.toThrow("Unauthorized");
  });
});

// ==========================================
// isAdmin / isLeagueAdmin
// ==========================================

describe("isAdmin", () => {
  it("returns true when authenticated", async () => {
    const token = await createSessionToken({
      leagueId: 1,
      leagueSlug: "test",
      adminUsername: "admin",
    });
    mockedCookies.mockResolvedValue({
      get: (name: string) => (name === "admin_session" ? { value: token } : undefined),
    } as unknown as Awaited<ReturnType<typeof cookies>>);

    expect(await isAdmin()).toBe(true);
  });

  it("returns false when not authenticated", async () => {
    mockedCookies.mockResolvedValue({
      get: () => undefined,
    } as unknown as Awaited<ReturnType<typeof cookies>>);

    expect(await isAdmin()).toBe(false);
  });
});

describe("isLeagueAdmin", () => {
  it("returns true for matching league", async () => {
    const token = await createSessionToken({
      leagueId: 1,
      leagueSlug: "test-league",
      adminUsername: "admin",
    });
    mockedCookies.mockResolvedValue({
      get: (name: string) => (name === "admin_session" ? { value: token } : undefined),
    } as unknown as Awaited<ReturnType<typeof cookies>>);

    expect(await isLeagueAdmin("test-league")).toBe(true);
  });

  it("returns false for different league", async () => {
    const token = await createSessionToken({
      leagueId: 1,
      leagueSlug: "test-league",
      adminUsername: "admin",
    });
    mockedCookies.mockResolvedValue({
      get: (name: string) => (name === "admin_session" ? { value: token } : undefined),
    } as unknown as Awaited<ReturnType<typeof cookies>>);

    expect(await isLeagueAdmin("other-league")).toBe(false);
  });

  it("returns false when not authenticated", async () => {
    mockedCookies.mockResolvedValue({
      get: () => undefined,
    } as unknown as Awaited<ReturnType<typeof cookies>>);

    expect(await isLeagueAdmin("any-league")).toBe(false);
  });
});
