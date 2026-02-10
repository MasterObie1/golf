import { validateEnv } from "./env";

/**
 * Shared session secret utility used by all auth modules.
 * Lazily validates env on first call rather than at module load time,
 * so that `next build` doesn't crash when SESSION_SECRET isn't set.
 */
export function getSessionSecret(): Uint8Array {
  validateEnv();
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error(
      "SESSION_SECRET environment variable is required. " +
      "Generate one with: openssl rand -base64 32"
    );
  }
  if (secret === "CHANGE-ME-generate-a-random-secret") {
    throw new Error(
      "SESSION_SECRET is still set to the default placeholder value. " +
      "Generate a real secret with: openssl rand -base64 32"
    );
  }
  return new TextEncoder().encode(secret);
}
