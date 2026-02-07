import { describe, it, expect, vi, beforeEach } from "vitest";

// ==========================================
// Mock setup — vi.hoisted ensures these are
// available when vi.mock factories run
// ==========================================

const { mockPrisma, mockBcryptCompare, mockGetGolfNews, mockCreateSessionToken } = vi.hoisted(() => ({
  mockPrisma: {
    league: {
      findUnique: vi.fn(),
      count: vi.fn(),
    },
  },
  mockBcryptCompare: vi.fn(),
  mockGetGolfNews: vi.fn(),
  mockCreateSessionToken: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: mockPrisma,
}));

vi.mock("@/lib/auth", () => ({
  createSessionToken: mockCreateSessionToken,
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: () => ({ allowed: true, remaining: 100, resetAt: Date.now() + 60000 }),
  getClientIp: () => "127.0.0.1",
  RATE_LIMITS: {
    login: { maxRequests: 5, windowSeconds: 900 },
    golfNews: { maxRequests: 30, windowSeconds: 60 },
  },
}));

vi.mock("bcryptjs", () => ({
  default: {
    compare: mockBcryptCompare,
  },
}));

vi.mock("@/lib/rss", () => ({
  getGolfNews: mockGetGolfNews,
}));

// ==========================================
// Import route handlers (after mocks)
// ==========================================

import { GET as healthGET } from "../../src/app/api/health/route";
import { POST as adminLoginPOST } from "../../src/app/api/admin/login/route";
import { GET as golfNewsGET } from "../../src/app/api/golf-news/route";

// ==========================================
// Helper: create a mock Request
// ==========================================

function createRequest(url: string, options?: RequestInit): Request {
  return new Request(`http://localhost:3000${url}`, {
    headers: {
      "Content-Type": "application/json",
      "x-forwarded-for": "127.0.0.1",
      ...((options?.headers as Record<string, string>) || {}),
    },
    ...options,
  });
}

// ==========================================
// Tests
// ==========================================

beforeEach(() => {
  vi.clearAllMocks();
  mockCreateSessionToken.mockResolvedValue("mock-jwt-token");
  mockGetGolfNews.mockResolvedValue([
    { title: "Golf News 1", link: "https://example.com/1", description: "Description 1", pubDate: "2026-01-01" },
    { title: "Golf News 2", link: "https://example.com/2", description: "Description 2", pubDate: "2026-01-02" },
  ]);
  mockBcryptCompare.mockImplementation(async (plain: string, hash: string) => {
    return plain === "correct-password" && hash === "hashed-password";
  });
});

describe("GET /api/health", () => {
  it("returns 200 with database connected when DB is up", async () => {
    mockPrisma.league.count.mockResolvedValueOnce(3);

    const response = await healthGET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.database.status).toBe("connected");
    expect(data.timestamp).toBeDefined();
  });

  it("returns 500 with database error when DB is down", async () => {
    mockPrisma.league.count.mockRejectedValueOnce(new Error("DB connection failed"));

    const response = await healthGET();
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.database.status).toBe("error");
    expect(data.timestamp).toBeDefined();
  });
});

describe("POST /api/admin/login", () => {
  it("returns 400 for missing fields", async () => {
    const request = createRequest("/api/admin/login", {
      method: "POST",
      body: JSON.stringify({}),
    });

    const response = await adminLoginPOST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("required");
  });

  it("returns 400 when password is missing", async () => {
    const request = createRequest("/api/admin/login", {
      method: "POST",
      body: JSON.stringify({ leagueSlug: "some-league" }),
    });

    const response = await adminLoginPOST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("required");
  });

  it("returns 404 for non-existent league", async () => {
    mockPrisma.league.findUnique.mockResolvedValueOnce(null);

    const request = createRequest("/api/admin/login", {
      method: "POST",
      body: JSON.stringify({ password: "anypass", leagueSlug: "non-existent" }),
    });

    const response = await adminLoginPOST(request);
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toContain("not found");
  });

  it("returns 401 for wrong password", async () => {
    mockPrisma.league.findUnique.mockResolvedValueOnce({
      id: 1,
      slug: "test-league",
      name: "Test League",
      adminUsername: "admin@TestLeague",
      adminPassword: "hashed-password",
    });

    const request = createRequest("/api/admin/login", {
      method: "POST",
      body: JSON.stringify({ password: "wrong-password", leagueSlug: "test-league" }),
    });

    const response = await adminLoginPOST(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toContain("Invalid");
  });

  it("returns 200 with session cookie for valid credentials", async () => {
    mockPrisma.league.findUnique.mockResolvedValueOnce({
      id: 1,
      slug: "test-league",
      name: "Test League",
      adminUsername: "admin@TestLeague",
      adminPassword: "hashed-password",
    });

    const request = createRequest("/api/admin/login", {
      method: "POST",
      body: JSON.stringify({ password: "correct-password", leagueSlug: "test-league" }),
    });

    const response = await adminLoginPOST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.leagueSlug).toBe("test-league");
    expect(data.leagueName).toBe("Test League");

    // Check that a session cookie was set
    const setCookie = response.headers.get("set-cookie");
    expect(setCookie).toContain("admin_session");
  });
});

describe("GET /api/golf-news", () => {
  it("returns 200 with news array", async () => {
    const response = await golfNewsGET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);
    expect(data[0]).toHaveProperty("title");
    expect(data[0]).toHaveProperty("link");
    expect(data[0]).toHaveProperty("description");
    expect(data[0]).toHaveProperty("pubDate");
  });
});
