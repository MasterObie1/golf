import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

let originalEnv: NodeJS.ProcessEnv;

beforeEach(() => {
  originalEnv = { ...process.env };
  vi.resetModules();
});

afterEach(() => {
  process.env = originalEnv;
});

describe("validateEnv", () => {
  it("returns env object with valid SESSION_SECRET", async () => {
    process.env.SESSION_SECRET = "this-is-a-valid-session-secret-at-least-32-chars";
    const { validateEnv } = await import("@/lib/env");
    const env = validateEnv();
    expect(env.SESSION_SECRET).toBe("this-is-a-valid-session-secret-at-least-32-chars");
  });

  it("caches result on repeat calls", async () => {
    process.env.SESSION_SECRET = "this-is-a-valid-session-secret-at-least-32-chars";
    const { validateEnv } = await import("@/lib/env");
    const first = validateEnv();
    const second = validateEnv();
    expect(first).toBe(second); // same reference
  });

  it("throws for missing SESSION_SECRET", async () => {
    delete process.env.SESSION_SECRET;
    const { validateEnv } = await import("@/lib/env");
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => validateEnv()).toThrow("Invalid environment");
  });

  it("throws for short SESSION_SECRET", async () => {
    process.env.SESSION_SECRET = "short";
    const { validateEnv } = await import("@/lib/env");
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => validateEnv()).toThrow("Invalid environment");
  });

  it("throws for placeholder SESSION_SECRET", async () => {
    process.env.SESSION_SECRET = "CHANGE-ME-generate-a-random-secret";
    const { validateEnv } = await import("@/lib/env");
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => validateEnv()).toThrow("Invalid environment");
  });

  it("accepts missing optional fields", async () => {
    process.env.SESSION_SECRET = "this-is-a-valid-session-secret-at-least-32-chars";
    delete process.env.RESEND_API_KEY;
    delete process.env.FROM_EMAIL;
    delete process.env.NEXT_PUBLIC_BASE_URL;
    const { validateEnv } = await import("@/lib/env");
    const env = validateEnv();
    expect(env.RESEND_API_KEY).toBeUndefined();
    expect(env.FROM_EMAIL).toBeUndefined();
  });

  it("accepts valid optional NEXT_PUBLIC_BASE_URL", async () => {
    process.env.SESSION_SECRET = "this-is-a-valid-session-secret-at-least-32-chars";
    process.env.NEXT_PUBLIC_BASE_URL = "https://example.com";
    const { validateEnv } = await import("@/lib/env");
    const env = validateEnv();
    expect(env.NEXT_PUBLIC_BASE_URL).toBe("https://example.com");
  });
});
