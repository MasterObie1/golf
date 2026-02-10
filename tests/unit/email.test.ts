import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

let originalEnv: NodeJS.ProcessEnv;

beforeEach(() => {
  originalEnv = { ...process.env };
  vi.resetModules();
});

afterEach(() => {
  process.env = originalEnv;
});

describe("isEmailConfigured", () => {
  it("returns true when RESEND_API_KEY is set", async () => {
    process.env.RESEND_API_KEY = "re_test_key";
    const { isEmailConfigured } = await import("@/lib/email");
    expect(isEmailConfigured()).toBe(true);
  });

  it("returns false when RESEND_API_KEY is not set", async () => {
    delete process.env.RESEND_API_KEY;
    const { isEmailConfigured } = await import("@/lib/email");
    expect(isEmailConfigured()).toBe(false);
  });
});

describe("sendScorecardEmail", () => {
  const emailParams = {
    to: "test@example.com",
    captainName: "John",
    teamName: "Eagles",
    leagueName: "Test League",
    weekNumber: 5,
    scorecardUrl: "https://example.com/scorecard/abc",
  };

  it("returns error when email is not configured", async () => {
    delete process.env.RESEND_API_KEY;
    const { sendScorecardEmail } = await import("@/lib/email");
    const result = await sendScorecardEmail(emailParams);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("not configured");
    }
  });

  it("calls resend API and returns success", async () => {
    process.env.RESEND_API_KEY = "re_test_key";

    vi.doMock("resend", () => ({
      Resend: class {
        emails = {
          send: vi.fn().mockResolvedValue({ data: { id: "msg_123" }, error: null }),
        };
      },
    }));

    const { sendScorecardEmail } = await import("@/lib/email");
    const result = await sendScorecardEmail(emailParams);
    expect(result.success).toBe(true);
  });

  it("returns error when Resend API returns error", async () => {
    process.env.RESEND_API_KEY = "re_test_key";

    vi.doMock("resend", () => ({
      Resend: class {
        emails = {
          send: vi.fn().mockResolvedValue({ data: null, error: { message: "Invalid recipient" } }),
        };
      },
    }));

    const { sendScorecardEmail } = await import("@/lib/email");
    const result = await sendScorecardEmail(emailParams);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe("Invalid recipient");
    }
  });

  it("returns error on thrown exception", async () => {
    process.env.RESEND_API_KEY = "re_test_key";

    vi.doMock("resend", () => ({
      Resend: class {
        emails = {
          send: vi.fn().mockRejectedValue(new Error("Network failure")),
        };
      },
    }));

    const { sendScorecardEmail } = await import("@/lib/email");
    const result = await sendScorecardEmail(emailParams);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe("Network failure");
    }
  });
});
