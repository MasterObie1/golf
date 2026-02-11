import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// We need to re-import the module for each test group to pick up env changes
// Use dynamic import to reset module state

// Helper to set NODE_ENV in tests (typed as read-only in @types/node)
const env = process.env as Record<string, string | undefined>;

let originalNodeEnv: string | undefined;
let originalLogLevel: string | undefined;

beforeEach(() => {
  originalNodeEnv = process.env.NODE_ENV;
  originalLogLevel = process.env.LOG_LEVEL;
});

afterEach(() => {
  env.NODE_ENV =originalNodeEnv;
  if (originalLogLevel === undefined) {
    delete process.env.LOG_LEVEL;
  } else {
    process.env.LOG_LEVEL = originalLogLevel;
  }
  vi.restoreAllMocks();
});

describe("logger", () => {
  // Since logger reads env at call time, we can test directly
  // Import statically since shouldLog checks env each time
  let logger: typeof import("@/lib/logger").logger;

  beforeEach(async () => {
    const mod = await import("@/lib/logger");
    logger = mod.logger;
  });

  describe("debug", () => {
    it("outputs when LOG_LEVEL=debug", () => {
      process.env.LOG_LEVEL = "debug";
      env.NODE_ENV ="development";
      const spy = vi.spyOn(console, "debug").mockImplementation(() => {});
      logger.debug("test message");
      expect(spy).toHaveBeenCalledOnce();
    });

    it("is suppressed when LOG_LEVEL=info", () => {
      process.env.LOG_LEVEL = "info";
      const spy = vi.spyOn(console, "debug").mockImplementation(() => {});
      logger.debug("test message");
      expect(spy).not.toHaveBeenCalled();
    });

    it("is suppressed when LOG_LEVEL=warn", () => {
      process.env.LOG_LEVEL = "warn";
      const spy = vi.spyOn(console, "debug").mockImplementation(() => {});
      logger.debug("test message");
      expect(spy).not.toHaveBeenCalled();
    });
  });

  describe("info", () => {
    it("outputs when LOG_LEVEL=info", () => {
      process.env.LOG_LEVEL = "info";
      const spy = vi.spyOn(console, "info").mockImplementation(() => {});
      logger.info("test message");
      expect(spy).toHaveBeenCalledOnce();
    });

    it("outputs when LOG_LEVEL=debug", () => {
      process.env.LOG_LEVEL = "debug";
      const spy = vi.spyOn(console, "info").mockImplementation(() => {});
      logger.info("test message");
      expect(spy).toHaveBeenCalledOnce();
    });

    it("is suppressed when LOG_LEVEL=warn", () => {
      process.env.LOG_LEVEL = "warn";
      const spy = vi.spyOn(console, "info").mockImplementation(() => {});
      logger.info("test message");
      expect(spy).not.toHaveBeenCalled();
    });
  });

  describe("warn", () => {
    it("outputs when LOG_LEVEL=warn", () => {
      process.env.LOG_LEVEL = "warn";
      const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
      logger.warn("test message");
      expect(spy).toHaveBeenCalledOnce();
    });

    it("is suppressed when LOG_LEVEL=error", () => {
      process.env.LOG_LEVEL = "error";
      const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
      logger.warn("test message");
      expect(spy).not.toHaveBeenCalled();
    });
  });

  describe("error", () => {
    it("outputs at error level", () => {
      process.env.LOG_LEVEL = "error";
      const spy = vi.spyOn(console, "error").mockImplementation(() => {});
      logger.error("test error");
      expect(spy).toHaveBeenCalledOnce();
    });

    it("includes Error message and stack in output", () => {
      process.env.LOG_LEVEL = "debug";
      env.NODE_ENV ="development";
      const spy = vi.spyOn(console, "error").mockImplementation(() => {});
      const err = new Error("something broke");
      logger.error("operation failed", err);
      const output = spy.mock.calls[0][0] as string;
      expect(output).toContain("operation failed");
      expect(output).toContain("something broke");
    });

    it("handles non-Error values", () => {
      process.env.LOG_LEVEL = "debug";
      env.NODE_ENV ="development";
      const spy = vi.spyOn(console, "error").mockImplementation(() => {});
      logger.error("operation failed", "string error");
      const output = spy.mock.calls[0][0] as string;
      expect(output).toContain("string error");
    });

    it("handles undefined error", () => {
      process.env.LOG_LEVEL = "debug";
      const spy = vi.spyOn(console, "error").mockImplementation(() => {});
      logger.error("operation failed", undefined);
      expect(spy).toHaveBeenCalledOnce();
    });
  });

  describe("format", () => {
    it("uses pretty format in development", () => {
      env.NODE_ENV ="development";
      process.env.LOG_LEVEL = "debug";
      const spy = vi.spyOn(console, "info").mockImplementation(() => {});
      logger.info("hello world");
      const output = spy.mock.calls[0][0] as string;
      expect(output).toMatch(/^\[INFO\] hello world$/);
    });

    it("includes meta in pretty format", () => {
      env.NODE_ENV ="development";
      process.env.LOG_LEVEL = "debug";
      const spy = vi.spyOn(console, "info").mockImplementation(() => {});
      logger.info("hello", { userId: 42 });
      const output = spy.mock.calls[0][0] as string;
      expect(output).toContain("[INFO]");
      expect(output).toContain("hello");
      expect(output).toContain('"userId":42');
    });

    it("uses JSON format in production", () => {
      env.NODE_ENV ="production";
      process.env.LOG_LEVEL = "info";
      const spy = vi.spyOn(console, "info").mockImplementation(() => {});
      logger.info("hello world");
      const output = spy.mock.calls[0][0] as string;
      const parsed = JSON.parse(output);
      expect(parsed.level).toBe("info");
      expect(parsed.message).toBe("hello world");
      expect(parsed.timestamp).toBeTruthy();
    });
  });

  describe("level filtering defaults", () => {
    it("defaults to debug in non-production", () => {
      delete process.env.LOG_LEVEL;
      env.NODE_ENV ="development";
      const spy = vi.spyOn(console, "debug").mockImplementation(() => {});
      logger.debug("test");
      expect(spy).toHaveBeenCalledOnce();
    });

    it("defaults to info in production", () => {
      delete process.env.LOG_LEVEL;
      env.NODE_ENV ="production";
      const spy = vi.spyOn(console, "debug").mockImplementation(() => {});
      logger.debug("test");
      expect(spy).not.toHaveBeenCalled();
    });
  });
});
