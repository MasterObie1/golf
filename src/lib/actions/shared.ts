// Internal utilities — NOT a "use server" module because it contains sync exports.
// Server action modules import from here directly.

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";

// Result type for server actions — avoids Next.js production error sanitization
export type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string };

export async function getServerActionIp(): Promise<string> {
  const hdrs = await headers();
  // x-vercel-forwarded-for is set by Vercel and cannot be spoofed. Generic proxy
  // headers are attacker-controlled unless a trusted proxy sets them, so they are
  // honored only when TRUST_PROXY_IP_HEADERS=true (self-hosted behind a proxy).
  const vercelIp = hdrs.get("x-vercel-forwarded-for")?.split(",")[0]?.trim();
  if (vercelIp) return vercelIp;

  if (process.env.TRUST_PROXY_IP_HEADERS === "true") {
    const proxyIp = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() || hdrs.get("x-real-ip");
    if (proxyIp) return proxyIp;
  }

  return "unknown";
}

/**
 * Revalidate every public page that renders league data. Call after any
 * mutation that changes standings, matchups, weekly scores, or handicaps.
 */
export function revalidateLeaguePages(leagueSlug: string): void {
  const pages = ["", "/history", "/leaderboard", "/handicap-history", "/schedule", "/scorecards"];
  for (const page of pages) {
    revalidatePath(`/league/${leagueSlug}${page}`);
  }
}

export function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
