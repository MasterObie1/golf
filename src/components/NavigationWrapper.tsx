import { getAdminSession } from "@/lib/auth";
import { Navigation } from "./Navigation";

export async function NavigationWrapper() {
  const session = await getAdminSession();

  // Only pass the leagueSlug - that's all Navigation needs to determine visibility
  const adminSession = session ? { leagueSlug: session.leagueSlug } : null;

  return <Navigation adminSession={adminSession} />;
}
