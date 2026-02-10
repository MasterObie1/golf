import { redirect, notFound } from "next/navigation";
import { getAdminSession } from "@/lib/auth";
import { getLeagueBySlug } from "@/lib/actions/leagues";
import { getTeams, getCurrentWeekNumber, getAllTeamsWithStatus } from "@/lib/actions/teams";
import { getMatchupHistory, getMatchupHistoryForSeason } from "@/lib/actions/matchups";
import { getLeagueAbout } from "@/lib/actions/league-about";
import {
  getSeasons,
  getActiveSeason,
  getTeamsForSeason,
  getCurrentWeekNumberForSeason,
} from "@/lib/actions/seasons";
import {
  getCurrentStrokePlayWeek,
  getWeeklyScoreHistory,
  getWeeklyScoreHistoryForSeason,
  type WeeklyScoreRecord,
} from "@/lib/actions/weekly-scores";
import type { AdminTeam } from "@/lib/types/admin";
import AdminDashboard from "./components/AdminDashboard";

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function AdminPage({ params }: Props) {
  const { slug } = await params;

  // Server-side auth check
  const session = await getAdminSession();
  if (!session || session.leagueSlug !== slug) {
    redirect(`/league/${slug}/admin/login`);
  }

  // Phase 1: League + seasons + allTeams + about (parallel)
  const [league, seasons, activeSeason, allTeams, aboutData] = await Promise.all([
    getLeagueBySlug(slug),
    getSeasons(session.leagueId),
    getActiveSeason(session.leagueId),
    getAllTeamsWithStatus(slug),
    getLeagueAbout(session.leagueId),
  ]);

  if (!league) notFound();

  // Phase 2: Season-dependent data (parallel)
  const [teams, weekNumber, matchupsResult, weeklyScoresData, strokePlayWeek] = await Promise.all([
    activeSeason ? getTeamsForSeason(activeSeason.id) : getTeams(session.leagueId),
    activeSeason ? getCurrentWeekNumberForSeason(activeSeason.id) : getCurrentWeekNumber(session.leagueId),
    activeSeason ? getMatchupHistoryForSeason(activeSeason.id) : getMatchupHistory(session.leagueId),
    league.scoringType !== "match_play"
      ? (activeSeason ? getWeeklyScoreHistoryForSeason(activeSeason.id) : getWeeklyScoreHistory(session.leagueId))
      : Promise.resolve([] as WeeklyScoreRecord[]),
    league.scoringType !== "match_play"
      ? getCurrentStrokePlayWeek(session.leagueId, activeSeason?.id)
      : Promise.resolve(1),
  ]);

  return (
    <AdminDashboard
      slug={slug}
      initialLeague={league}
      initialTeams={teams as AdminTeam[]}
      initialAllTeams={allTeams as AdminTeam[]}
      initialMatchups={matchupsResult.matchups}
      initialWeeklyScores={weeklyScoresData}
      initialWeekNumber={weekNumber}
      initialStrokePlayWeek={strokePlayWeek}
      initialSeasons={seasons}
      initialActiveSeason={activeSeason ? { id: activeSeason.id, name: activeSeason.name } : null}
      initialAboutData={aboutData}
    />
  );
}
