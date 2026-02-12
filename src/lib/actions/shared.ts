// Internal utilities — NOT a "use server" module because it contains sync exports.
// Server action modules import from here directly.

import { headers } from "next/headers";

// Result type for server actions — avoids Next.js production error sanitization
export type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string };

export async function getServerActionIp(): Promise<string> {
  const hdrs = await headers();
  // Prefer Vercel's non-spoofable header, then fall back to x-forwarded-for
  return hdrs.get("x-vercel-forwarded-for")?.split(",")[0]?.trim()
    || hdrs.get("x-forwarded-for")?.split(",")[0]?.trim()
    || hdrs.get("x-real-ip")
    || "unknown";
}

export function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
