import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { checkRateLimit, getClientIp, RATE_LIMITS } from "@/lib/rate-limit";

describe("checkRateLimit", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows first request", () => {
    const result = checkRateLimit("test-first-1", { maxRequests: 5, windowSeconds: 60 });
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4);
  });

  it("returns correct resetAt timestamp", () => {
    const now = Date.now();
    const result = checkRateLimit("test-reset-1", { maxRequests: 5, windowSeconds: 60 });
    expect(result.resetAt).toBe(now + 60 * 1000);
  });

  it("decrements remaining on subsequent requests", () => {
    const config = { maxRequests: 3, windowSeconds: 60 };
    const r1 = checkRateLimit("test-decrement-1", config);
    expect(r1.remaining).toBe(2);
    const r2 = checkRateLimit("test-decrement-1", config);
    expect(r2.remaining).toBe(1);
    const r3 = checkRateLimit("test-decrement-1", config);
    expect(r3.remaining).toBe(0);
  });

  it("blocks when limit is reached", () => {
    const config = { maxRequests: 2, windowSeconds: 60 };
    checkRateLimit("test-block-1", config);
    checkRateLimit("test-block-1", config);
    const r3 = checkRateLimit("test-block-1", config);
    expect(r3.allowed).toBe(false);
    expect(r3.remaining).toBe(0);
  });

  it("resets after window expires", () => {
    const config = { maxRequests: 2, windowSeconds: 60 };
    checkRateLimit("test-expire-1", config);
    checkRateLimit("test-expire-1", config);

    // Advance past window
    vi.advanceTimersByTime(61 * 1000);

    const result = checkRateLimit("test-expire-1", config);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(1);
  });

  it("different keys are independent", () => {
    const config = { maxRequests: 1, windowSeconds: 60 };
    checkRateLimit("test-key-a", config);
    const result = checkRateLimit("test-key-b", config);
    expect(result.allowed).toBe(true);
  });
});

describe("getClientIp", () => {
  it("prefers x-vercel-forwarded-for", () => {
    const req = new Request("http://localhost", {
      headers: {
        "x-vercel-forwarded-for": "1.2.3.4",
        "x-forwarded-for": "5.6.7.8",
      },
    });
    expect(getClientIp(req)).toBe("1.2.3.4");
  });

  it("falls back to x-forwarded-for", () => {
    const req = new Request("http://localhost", {
      headers: { "x-forwarded-for": "5.6.7.8, 10.0.0.1" },
    });
    expect(getClientIp(req)).toBe("5.6.7.8");
  });

  it("falls back to x-real-ip", () => {
    const req = new Request("http://localhost", {
      headers: { "x-real-ip": "9.8.7.6" },
    });
    expect(getClientIp(req)).toBe("9.8.7.6");
  });

  it("falls back to cf-connecting-ip", () => {
    const req = new Request("http://localhost", {
      headers: { "cf-connecting-ip": "11.12.13.14" },
    });
    expect(getClientIp(req)).toBe("11.12.13.14");
  });

  it("returns anon hash when no IP headers present", () => {
    const req = new Request("http://localhost", {
      headers: { "user-agent": "TestBrowser/1.0" },
    });
    const result = getClientIp(req);
    expect(result).toMatch(/^anon-/);
  });

  it("returns consistent hash for same user-agent", () => {
    const req1 = new Request("http://localhost", {
      headers: { "user-agent": "TestBrowser/1.0" },
    });
    const req2 = new Request("http://localhost", {
      headers: { "user-agent": "TestBrowser/1.0" },
    });
    expect(getClientIp(req1)).toBe(getClientIp(req2));
  });

  it("takes first IP from comma-separated x-vercel-forwarded-for", () => {
    const req = new Request("http://localhost", {
      headers: { "x-vercel-forwarded-for": "1.1.1.1, 2.2.2.2, 3.3.3.3" },
    });
    expect(getClientIp(req)).toBe("1.1.1.1");
  });
});

describe("RATE_LIMITS", () => {
  it("has expected configuration keys", () => {
    expect(RATE_LIMITS.login).toBeDefined();
    expect(RATE_LIMITS.sudoLogin).toBeDefined();
    expect(RATE_LIMITS.createLeague).toBeDefined();
    expect(RATE_LIMITS.registerTeam).toBeDefined();
    expect(RATE_LIMITS.scorecardSave).toBeDefined();
  });

  it("has reasonable values", () => {
    expect(RATE_LIMITS.login.maxRequests).toBeGreaterThan(0);
    expect(RATE_LIMITS.login.windowSeconds).toBeGreaterThan(0);
    expect(RATE_LIMITS.sudoLogin.maxRequests).toBeLessThanOrEqual(RATE_LIMITS.login.maxRequests);
  });
});
