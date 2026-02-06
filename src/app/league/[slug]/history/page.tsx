import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getLeagueBySlug,
  getSeasons,
  getActiveSeason,
  getMatchupHistoryForSeason,
} from "@/lib/actions";
import { ScoreCard } from "@/components/ScoreCard";
import { SeasonSelector } from "@/components/SeasonSelector";
import type { Metadata } from "next";

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ seasonId?: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const league = await getLeagueBySlug(slug);
  if (!league) return { title: "Match History" };
  return {
    title: `Match History - ${league.name}`,
    description: `Match history and results for ${league.name}`,
  };
}

export default async function LeagueHistoryPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { seasonId } = await searchParams;

  const league = await getLeagueBySlug(slug);
  if (!league) {
    notFound();
  }

  const seasons = await getSeasons(league.id);
  const activeSeason = await getActiveSeason(league.id);

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

  // Get matchups for the current season
  const matchups = currentSeasonId
    ? await getMatchupHistoryForSeason(currentSeasonId)
    : [];

  // Group matchups by week and transform to ScoreCard format
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

  const weekNumbers = Object.keys(matchupsByWeek)
    .map(Number)
    .sort((a, b) => b - a);

  const currentSeason = currentSeasonId
    ? seasons.find((s) => s.id === currentSeasonId)
    : null;

  return (
    <div className="min-h-screen bg-bg-primary">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="mb-6">
          <Link
            href={`/league/${slug}`}
            className="text-green-primary hover:text-green-dark"
          >
            &larr; Back to {league.name}
          </Link>
        </div>

        <div className="flex items-center justify-between mb-2">
          <h1 className="text-3xl font-bold text-green-dark">Match History</h1>
          {seasons.length > 0 && (
            <SeasonSelector
              seasons={seasons}
              currentSeasonId={currentSeasonId}
              leagueSlug={slug}
            />
          )}
        </div>
        <p className="text-gray-600 mb-8">
          {league.name}
          {currentSeason && ` - ${currentSeason.name}`}
        </p>

        {seasons.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-8 text-center">
            <p className="text-gray-500">No seasons have been created yet.</p>
          </div>
        ) : matchups.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-8 text-center">
            <p className="text-gray-500">No matches have been played yet.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {weekNumbers.map((weekNumber) => (
              <ScoreCard
                key={weekNumber}
                weekNumber={weekNumber}
                matchups={matchupsByWeek[weekNumber]}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
