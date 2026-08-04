/**
 * Single source of truth for a league's navigation links.
 * Consumed by the league nav bar AND the league home quick-links,
 * so the two can never disagree about which pages exist.
 */

export interface LeagueNavContext {
  slug: string;
  scoringType: string | null;
  scorecardMode: string | null;
  isAdmin?: boolean;
}

export interface LeagueNavLink {
  key:
    | "home"
    | "leaderboard"
    | "history"
    | "schedule"
    | "scorecards"
    | "signup"
    | "admin";
  href: string;
  label: string;
}

export function leagueNavLinks(ctx: LeagueNavContext): LeagueNavLink[] {
  const base = `/league/${ctx.slug}`;
  const isStrokePlay = ctx.scoringType === "stroke_play";

  const links: LeagueNavLink[] = [
    { key: "home", href: base, label: "Home" },
    { key: "leaderboard", href: `${base}/leaderboard`, label: "Leaderboard" },
    {
      key: "history",
      href: `${base}/history`,
      label: isStrokePlay ? "Score History" : "Match History",
    },
  ];

  // Stroke-play leagues have no matchup schedule; /schedule redirects away.
  if (!isStrokePlay) {
    links.push({ key: "schedule", href: `${base}/schedule`, label: "Schedule" });
  }

  if (ctx.scorecardMode !== "disabled") {
    links.push({
      key: "scorecards",
      href: `${base}/scorecards`,
      label: "Scorecards",
    });
  }

  // The signup page itself explains closed registration, so always link it.
  links.push({ key: "signup", href: `${base}/signup`, label: "Sign Up" });

  if (ctx.isAdmin) {
    links.push({ key: "admin", href: `${base}/admin`, label: "Admin" });
  }

  return links;
}
