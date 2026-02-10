import Link from "next/link";
import { notFound } from "next/navigation";
import { getLeagueBySlug } from "@/lib/actions/leagues";
import { getSeasons, getActiveSeason } from "@/lib/actions/seasons";
import {
  getSeasonLeaderboard,
  getAllTimeLeaderboard,
} from "@/lib/actions/standings";
import { LeaderboardTable } from "@/components/LeaderboardTable";
import { SeasonSelector } from "@/components/SeasonSelector";
import { ContourBackground } from "@/components/grounds/ContourBackground";
import type { Metadata } from "next";

export const revalidate = 60;

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ seasonId?: string; view?: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const league = await getLeagueBySlug(slug);
  if (!league) return { title: "Leaderboard" };
  return {
    title: `Leaderboard - ${league.name}`,
    description: `Current standings and rankings for ${league.name}`,
  };
}

export default async function LeagueLeaderboardPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { seasonId, view } = await searchParams;

  const league = await getLeagueBySlug(slug);
  if (!league) {
    notFound();
  }

  const leagueScoringType = (league.scoringType || "match_play") as "match_play" | "stroke_play" | "hybrid";

  const [seasons, activeSeason] = await Promise.all([
    getSeasons(league.id),
    getActiveSeason(league.id),
  ]);

  // Determine which season to show
  let currentSeasonId: number | null = null;
  const showAllTime = view === "all-time";

  if (!showAllTime) {
    if (seasonId) {
      const parsed = parseInt(seasonId, 10);
      if (!isNaN(parsed)) currentSeasonId = parsed;
    }
    if (currentSeasonId === null) {
      currentSeasonId = activeSeason?.id ?? seasons[0]?.id ?? null;
    }
  }

  // Use season's scoring type for historical accuracy
  const currentSeason = currentSeasonId ? seasons.find((s) => s.id === currentSeasonId) : null;
  const scoringType = (
    currentSeason?.scoringType || leagueScoringType
  ) as "match_play" | "stroke_play" | "hybrid";
  const isStrokePlay = scoringType === "stroke_play";

  // Get the appropriate leaderboard data
  let teams: {
    id: number;
    name: string;
    totalPoints: number;
    wins: number;
    losses: number;
    ties: number;
    handicap: number | null;
    roundsPlayed: number;
    rankChange: number | null;
    handicapChange: number | null;
    avgNet?: number;
    bestFinish?: number;
    matchPoints?: number;
    fieldPoints?: number;
  }[] = [];

  if (showAllTime) {
    const allTimeStats = await getAllTimeLeaderboard(league.id);
    teams = allTimeStats.map((stat) => ({
      id: -1,
      name: stat.name,
      totalPoints: stat.totalPoints,
      wins: stat.wins,
      losses: stat.losses,
      ties: stat.ties,
      // All-time view aggregates across seasons, so no single handicap applies.
      handicap: null,
      roundsPlayed: stat.matchCount,
      rankChange: null,
      handicapChange: null,
      avgNet: "avgNet" in stat ? (stat as { avgNet: number }).avgNet : undefined,
      bestFinish: "bestFinish" in stat ? (stat as { bestFinish: number }).bestFinish : undefined,
    }));
  } else if (currentSeasonId) {
    const seasonTeams = await getSeasonLeaderboard(currentSeasonId);
    teams = seasonTeams.map((team) => ({
      id: team.id,
      name: team.name,
      totalPoints: team.totalPoints,
      wins: team.wins,
      losses: team.losses,
      ties: team.ties,
      handicap: team.handicap,
      roundsPlayed: "roundsPlayed" in team
        ? (team as { roundsPlayed: number }).roundsPlayed
        : team.wins + team.losses + team.ties,
      rankChange: null,
      handicapChange: null,
      avgNet: "avgNet" in team ? (team as { avgNet: number }).avgNet : undefined,
      bestFinish: "bestFinish" in team ? (team as { bestFinish: number }).bestFinish : undefined,
      matchPoints: "matchPoints" in team ? (team as { matchPoints: number }).matchPoints : undefined,
      fieldPoints: "fieldPoints" in team ? (team as { fieldPoints: number }).fieldPoints : undefined,
    }));
  }

  return (
    <div className="min-h-screen bg-surface relative">
      <ContourBackground variant="hills" color="text-fairway" opacity="opacity-[0.04]" />

      <div className="relative max-w-4xl mx-auto px-4 py-8">
        <div className="mb-6 flex items-center justify-between">
          <Link
            href={`/league/${slug}`}
            className="text-fairway hover:text-rough font-display text-sm uppercase tracking-wider transition-colors"
          >
            &larr; Back to {league.name}
          </Link>
          <Link
            href={`/league/${slug}/handicap-history${currentSeasonId ? `?seasonId=${currentSeasonId}` : ""}`}
            className="text-fairway hover:text-rough font-display text-sm uppercase tracking-wider transition-colors"
          >
            Handicap History &rarr;
          </Link>
        </div>

        <div className="flex items-center justify-between mb-2">
          <h1 className="text-3xl font-bold text-scorecard-pencil font-display uppercase tracking-wider">
            Leaderboard
          </h1>
          {seasons.length > 0 && (
            <SeasonSelector
              seasons={seasons}
              currentSeasonId={currentSeasonId}
              leagueSlug={slug}
              showAllTime={true}
            />
          )}
        </div>
        <p className="text-text-secondary mb-8 font-sans">
          {league.name}
          {currentSeason && !showAllTime && ` \u2014 ${currentSeason.name}`}
          {showAllTime && " \u2014 All-Time Stats"}
        </p>

        {seasons.length === 0 ? (
          <div className="bg-scorecard-paper rounded-lg shadow-sm border border-scorecard-line/50 p-8 text-center">
            <p className="text-text-muted font-sans">No seasons have been created yet.</p>
            <p className="text-text-light text-sm mt-2 font-sans">
              The league admin needs to create a season before teams can register.
            </p>
          </div>
        ) : teams.length === 0 ? (
          <div className="bg-scorecard-paper rounded-lg shadow-sm border border-scorecard-line/50 p-8 text-center">
            <p className="text-text-muted font-sans">
              {showAllTime
                ? `No teams have played any ${isStrokePlay ? "rounds" : "matches"} yet.`
                : "No teams have been approved for this season yet."}
            </p>
          </div>
        ) : (
          <LeaderboardTable
            teams={teams}
            leagueSlug={slug}
            scoringType={scoringType}
            hideMovement={showAllTime}
            proRate={league.strokePlayProRate}
          />
        )}
      </div>
    </div>
  );
}
