import Link from "next/link";
import { notFound } from "next/navigation";
import { getLeagueBySlug } from "@/lib/actions/leagues";
import { getSeasons, getActiveSeason } from "@/lib/actions/seasons";
import { getMatchupHistoryForSeason } from "@/lib/actions/matchups";
import { getWeeklyScoreHistoryForSeason } from "@/lib/actions/weekly-scores";
import { getScorecardAvailabilityForSeason } from "@/lib/actions/scorecards";
import { ScoreCard } from "@/components/ScoreCard";
import { MatchupWithScorecards } from "@/components/MatchupWithScorecards";
import { WeeklyScoreCard } from "@/components/WeeklyScoreCard";
import { SeasonSelector } from "@/components/SeasonSelector";
import { ContourBackground } from "@/components/grounds/ContourBackground";
import type { Metadata } from "next";

export const revalidate = 60;

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ seasonId?: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const league = await getLeagueBySlug(slug);
  if (!league) return { title: "Match History" };
  const isStrokePlay = league.scoringType === "stroke_play";
  return {
    title: `${isStrokePlay ? "Score" : "Match"} History - ${league.name}`,
    description: `${isStrokePlay ? "Score" : "Match"} history and results for ${league.name}`,
  };
}

export default async function LeagueHistoryPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { seasonId } = await searchParams;

  const league = await getLeagueBySlug(slug);
  if (!league) {
    notFound();
  }

  const [seasons, activeSeason] = await Promise.all([
    getSeasons(league.id),
    getActiveSeason(league.id),
  ]);

  // Determine which season to show
  let currentSeasonId: number | null = null;
  if (seasonId) {
    const parsed = parseInt(seasonId, 10);
    if (!isNaN(parsed)) currentSeasonId = parsed;
  }
  if (currentSeasonId === null && activeSeason) {
    currentSeasonId = activeSeason.id;
  } else if (seasons.length > 0) {
    currentSeasonId = seasons[0].id;
  }

  // Use season's scoring type for historical accuracy
  const currentSeason = currentSeasonId ? seasons.find((s) => s.id === currentSeasonId) : null;
  const scoringType = currentSeason?.scoringType || league.scoringType || "match_play";
  const isStrokePlay = scoringType === "stroke_play";
  const isHybrid = scoringType === "hybrid";

  // Fetch data based on scoring type
  const hasMatchPlay = scoringType === "match_play" || isHybrid;
  const hasStrokePlay = isStrokePlay || isHybrid;

  const scorecardsEnabled = league.scorecardMode !== "disabled";

  const [matchupsResult, weeklyScores, scorecardAvailability] = await Promise.all([
    hasMatchPlay && currentSeasonId
      ? getMatchupHistoryForSeason(currentSeasonId)
      : Promise.resolve({ matchups: [], hasMore: false }),
    hasStrokePlay && currentSeasonId
      ? getWeeklyScoreHistoryForSeason(currentSeasonId)
      : Promise.resolve([]),
    scorecardsEnabled && currentSeasonId
      ? getScorecardAvailabilityForSeason(league.id, currentSeasonId)
      : Promise.resolve([]),
  ]);

  const matchups = matchupsResult.matchups;

  // Group matchups by week
  const matchupsByWeek = matchups.reduce(
    (acc, matchup) => {
      if (!acc[matchup.weekNumber]) {
        acc[matchup.weekNumber] = [];
      }
      acc[matchup.weekNumber].push({
        id: matchup.id,
        teamA: {
          name: matchup.teamA.name,
          gross: matchup.teamAGross,
          handicap: matchup.teamAHandicap,
          net: matchup.teamANet,
          points: matchup.teamAPoints,
          isSub: matchup.teamAIsSub,
        },
        teamB: {
          name: matchup.teamB.name,
          gross: matchup.teamBGross,
          handicap: matchup.teamBHandicap,
          net: matchup.teamBNet,
          points: matchup.teamBPoints,
          isSub: matchup.teamBIsSub,
        },
        isForfeit: matchup.isForfeit,
        forfeitTeamId: matchup.forfeitTeamId,
        teamAId: matchup.teamAId,
        teamBId: matchup.teamBId,
      });
      return acc;
    },
    {} as Record<number, {
      id: number;
      teamA: { name: string; gross: number; handicap: number; net: number; points: number; isSub: boolean };
      teamB: { name: string; gross: number; handicap: number; net: number; points: number; isSub: boolean };
      isForfeit: boolean;
      forfeitTeamId: number | null;
      teamAId: number;
      teamBId: number;
    }[]>
  );

  const matchupWeekNumbers = Object.keys(matchupsByWeek)
    .map(Number)
    .sort((a, b) => b - a);

  // Group weekly scores by week
  const scoresByWeek: Record<number, typeof weeklyScores> = {};
  for (const score of weeklyScores) {
    if (!scoresByWeek[score.weekNumber]) {
      scoresByWeek[score.weekNumber] = [];
    }
    scoresByWeek[score.weekNumber].push(score);
  }

  const scoreWeekNumbers = Object.keys(scoresByWeek)
    .map(Number)
    .sort((a, b) => b - a);

  const hasNoData = matchups.length === 0 && weeklyScores.length === 0;
  const pageTitle = isStrokePlay ? "Score History" : "Match History";

  return (
    <div className="min-h-screen bg-surface relative">
      <ContourBackground variant="hills" color="text-fairway" opacity="opacity-[0.04]" />

      <div className="relative max-w-4xl mx-auto px-4 py-8">
        <div className="mb-6">
          <Link
            href={`/league/${slug}`}
            className="text-fairway hover:text-rough font-display text-sm uppercase tracking-wider transition-colors"
          >
            &larr; Back to {league.name}
          </Link>
        </div>

        <div className="flex items-center justify-between mb-2">
          <h1 className="text-3xl font-bold text-scorecard-pencil font-display uppercase tracking-wider">
            {pageTitle}
          </h1>
          {seasons.length > 0 && (
            <SeasonSelector
              seasons={seasons}
              currentSeasonId={currentSeasonId}
              leagueSlug={slug}
            />
          )}
        </div>
        <p className="text-text-secondary mb-8 font-sans">
          {league.name}
          {currentSeason && ` \u2014 ${currentSeason.name}`}
        </p>

        {seasons.length === 0 ? (
          <div className="bg-scorecard-paper rounded-lg shadow-sm border border-black/5 p-8 text-center">
            <p className="text-text-muted font-sans">No seasons have been created yet.</p>
          </div>
        ) : hasNoData ? (
          <div className="bg-scorecard-paper rounded-lg shadow-sm border border-black/5 p-8 text-center">
            <p className="text-text-muted font-sans">
              No {isStrokePlay ? "scores" : "matches"} have been played yet.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {/* Match play results */}
            {hasMatchPlay && matchupWeekNumbers.length > 0 && (
              <>
                {isHybrid && scoreWeekNumbers.length > 0 && (
                  <h2 className="text-xl font-semibold text-scorecard-pencil font-display uppercase tracking-wider mb-4">
                    Match Results
                  </h2>
                )}
                {matchupWeekNumbers.map((weekNumber) =>
                  scorecardsEnabled && scorecardAvailability.length > 0 ? (
                    <MatchupWithScorecards
                      key={`matchup-${weekNumber}`}
                      weekNumber={weekNumber}
                      matchups={matchupsByWeek[weekNumber]}
                      leagueId={league.id}
                      scorecardAvailabilityRaw={scorecardAvailability}
                    />
                  ) : (
                    <ScoreCard
                      key={`matchup-${weekNumber}`}
                      weekNumber={weekNumber}
                      matchups={matchupsByWeek[weekNumber]}
                    />
                  )
                )}
              </>
            )}

            {/* Stroke play / field results */}
            {hasStrokePlay && scoreWeekNumbers.length > 0 && (
              <>
                {isHybrid && matchupWeekNumbers.length > 0 && (
                  <h2 className="text-xl font-semibold text-scorecard-pencil font-display uppercase tracking-wider mb-4 mt-8">
                    Field Results
                  </h2>
                )}
                {scoreWeekNumbers.map((weekNumber) => (
                  <WeeklyScoreCard
                    key={`score-${weekNumber}`}
                    weekNumber={weekNumber}
                    scores={scoresByWeek[weekNumber]}
                  />
                ))}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
