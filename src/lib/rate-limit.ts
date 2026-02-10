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
 * Extract client IP from request headers.
 * Prefers Vercel's non-spoofable header, falls back to standard proxy headers.
 * Never returns a shared key — hashes User-Agent as last resort to avoid
 * one user's rate limit locking out everyone.
 */
export function getClientIp(request: Request): string {
  const headers = new Headers(request.headers);
  // x-vercel-forwarded-for is set by Vercel and cannot be spoofed by clients
  const vercelIp = headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim();
  if (vercelIp) return vercelIp;

  const forwardedFor = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (forwardedFor) return forwardedFor;

  const realIp = headers.get("x-real-ip");
  if (realIp) return realIp;

  const cfIp = headers.get("cf-connecting-ip");
  if (cfIp) return cfIp;

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
