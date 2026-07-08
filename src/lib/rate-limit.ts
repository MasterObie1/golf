/**
 * Simple in-memory rate limiter.
 * Suitable for single-instance deployments (Vercel serverless will have
 * per-instance state, which still provides meaningful protection).
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

// Clean up expired entries every 5 minutes
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store) {
      if (now > entry.resetAt) {
        store.delete(key);
      }
    }
  }, 5 * 60 * 1000);
}

interface RateLimitConfig {
  /** Maximum number of requests in the window */
  maxRequests: number;
  /** Time window in seconds */
  windowSeconds: number;
}

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

/**
 * Check if a request is allowed under the rate limit.
 *
 * @param key - Unique identifier (e.g., "login:192.168.1.1" or "create-league:192.168.1.1")
 * @param config - Rate limit configuration
 * @returns Whether the request is allowed and remaining count
 */
export function checkRateLimit(key: string, config: RateLimitConfig): RateLimitResult {
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || now > entry.resetAt) {
    // First request or window has expired
    const resetAt = now + config.windowSeconds * 1000;
    store.set(key, { count: 1, resetAt });
    return { allowed: true, remaining: config.maxRequests - 1, resetAt };
  }

  if (entry.count >= config.maxRequests) {
    // Rate limit exceeded
    return { allowed: false, remaining: 0, resetAt: entry.resetAt };
  }

  // Increment count
  entry.count++;
  return {
    allowed: true,
    remaining: config.maxRequests - entry.count,
    resetAt: entry.resetAt,
  };
}

/**
 * Durable, DB-backed rate limit check (sliding window over LoginAttempt rows).
 *
 * Use for high-value endpoints (logins): serverless instances share the
 * database, unlike the in-memory limiter which resets on every cold start.
 * Falls back to the in-memory limiter if the database is unreachable, so an
 * outage degrades protection rather than blocking logins entirely.
 */
export async function checkRateLimitDurable(key: string, config: RateLimitConfig): Promise<RateLimitResult> {
  const now = Date.now();
  const windowStart = new Date(now - config.windowSeconds * 1000);

  try {
    // Lazy import keeps this module usable in contexts without a DB (e.g. tests
    // that mock it, edge middleware bundles).
    const { prisma } = await import("./db");

    // Opportunistic cleanup of expired attempts for this key
    await prisma.loginAttempt.deleteMany({
      where: { key, createdAt: { lt: windowStart } },
    });

    const count = await prisma.loginAttempt.count({
      where: { key, createdAt: { gte: windowStart } },
    });

    if (count >= config.maxRequests) {
      const oldest = await prisma.loginAttempt.findFirst({
        where: { key, createdAt: { gte: windowStart } },
        orderBy: { createdAt: "asc" },
        select: { createdAt: true },
      });
      const resetAt = (oldest?.createdAt.getTime() ?? now) + config.windowSeconds * 1000;
      return { allowed: false, remaining: 0, resetAt };
    }

    await prisma.loginAttempt.create({ data: { key } });
    return {
      allowed: true,
      remaining: config.maxRequests - count - 1,
      resetAt: now + config.windowSeconds * 1000,
    };
  } catch (error) {
    console.error("Durable rate limit check failed, falling back to in-memory:", error instanceof Error ? error.message : error);
    return checkRateLimit(key, config);
  }
}

/**
 * Extract client IP from request headers.
 *
 * Only trusts headers that clients cannot spoof: x-vercel-forwarded-for is set
 * by Vercel's edge. Generic proxy headers (x-forwarded-for, x-real-ip,
 * cf-connecting-ip) are attacker-controlled unless a trusted proxy sets them,
 * so they are honored only when TRUST_PROXY_IP_HEADERS=true (self-hosted
 * deployments behind a reverse proxy). Never returns a shared key — hashes
 * User-Agent as last resort to avoid one user's rate limit locking out everyone.
 */
export function getClientIp(request: Request): string {
  const headers = new Headers(request.headers);
  // x-vercel-forwarded-for is set by Vercel and cannot be spoofed by clients
  const vercelIp = headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim();
  if (vercelIp) return vercelIp;

  if (process.env.TRUST_PROXY_IP_HEADERS === "true") {
    const forwardedFor = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    if (forwardedFor) return forwardedFor;

    const realIp = headers.get("x-real-ip");
    if (realIp) return realIp;

    const cfIp = headers.get("cf-connecting-ip");
    if (cfIp) return cfIp;
  }

  // Last resort: hash the user-agent to avoid all unknown clients sharing one bucket
  const ua = headers.get("user-agent") || "no-ua";
  let hash = 0;
  for (let i = 0; i < ua.length; i++) {
    hash = ((hash << 5) - hash + ua.charCodeAt(i)) | 0;
  }
  return `anon-${hash.toString(36)}`;
}

// Pre-configured rate limit configs
export const RATE_LIMITS = {
  /** Login attempts: 5 per 15 minutes */
  login: { maxRequests: 5, windowSeconds: 15 * 60 },
  /** Super-admin login: 3 per 15 minutes */
  sudoLogin: { maxRequests: 3, windowSeconds: 15 * 60 },
  /** League creation: 3 per hour */
  createLeague: { maxRequests: 3, windowSeconds: 60 * 60 },
  /** Team registration: 10 per hour */
  registerTeam: { maxRequests: 10, windowSeconds: 60 * 60 },
  /** Scorecard hole saves: 100 per 15 minutes (auto-save) */
  scorecardSave: { maxRequests: 100, windowSeconds: 15 * 60 },
} as const;
