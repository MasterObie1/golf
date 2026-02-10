import type { getLeagueBySlug } from "@/lib/actions/leagues";
import type { getMatchupHistory } from "@/lib/actions/matchups";

/** League data as returned by getLeagueBySlug (excludes sensitive fields like adminPassword) */
export type AdminLeague = NonNullable<Awaited<ReturnType<typeof getLeagueBySlug>>>;

/** Full matchup with team includes, from getMatchupHistory */
type MatchupHistoryResult = Awaited<ReturnType<typeof getMatchupHistory>>;
export type AdminMatchup = MatchupHistoryResult["matchups"][number];

/** Team as used across admin components — optional fields vary by data source */
export interface AdminTeam {
  id: number;
  name: string;
  status?: string;
  captainName?: string | null;
  email?: string | null;
  phone?: string | null;
}
