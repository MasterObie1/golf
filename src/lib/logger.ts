type LogLevel = "debug" | "info" | "warn" | "error";

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

function getMinLevel(): number {
  const env = process.env.LOG_LEVEL?.toLowerCase();
  if (env && env in LOG_LEVELS) return LOG_LEVELS[env as LogLevel];
  return process.env.NODE_ENV === "production" ? LOG_LEVELS.info : LOG_LEVELS.debug;
}

function formatMessage(level: LogLevel, message: string, meta?: Record<string, unknown>) {
  const isProduction = process.env.NODE_ENV === "production";

  if (isProduction) {
    // Structured JSON in production
    return JSON.stringify({
      level,
      message,
      timestamp: new Date().toISOString(),
      ...meta,
    });
  }

  // Pretty format in dev
  const prefix = `[${level.toUpperCase()}]`;
  const metaStr = meta ? ` ${JSON.stringify(meta)}` : "";
  return `${prefix} ${message}${metaStr}`;
}

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= getMinLevel();
}

export const logger = {
  debug(message: string, meta?: Record<string, unknown>) {
    if (shouldLog("debug")) console.debug(formatMessage("debug", message, meta));
  },
  info(message: string, meta?: Record<string, unknown>) {
    if (shouldLog("info")) console.info(formatMessage("info", message, meta));
  },
  warn(message: string, meta?: Record<string, unknown>) {
    if (shouldLog("warn")) console.warn(formatMessage("warn", message, meta));
  },
  error(message: string, error?: unknown, meta?: Record<string, unknown>) {
    if (!shouldLog("error")) return;
    const errorMeta: Record<string, unknown> = { ...meta };
    if (error instanceof Error) {
      errorMeta.errorMessage = error.message;
      errorMeta.stack = error.stack;
    } else if (error !== undefined) {
      errorMeta.errorValue = String(error);
    }
    console.error(formatMessage("error", message, errorMeta));
  },
};
