import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getLeagueBySlug,
  getSeasons,
  getActiveSeason,
  getSeasonLeaderboard,
  getAllTimeLeaderboard,
} from "@/lib/actions";
import { LeaderboardTable } from "@/components/LeaderboardTable";
import { SeasonSelector } from "@/components/SeasonSelector";
import type { Metadata } from "next";

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

  const seasons = await getSeasons(league.id);
  const activeSeason = await getActiveSeason(league.id);

  // Determine which season to show
  let currentSeasonId: number | null = null;
  let showAllTime = view === "all-time";

  if (!showAllTime) {
    if (seasonId) {
      const parsed = parseInt(seasonId, 10);
      if (!isNaN(parsed)) currentSeasonId = parsed;
    }
    if (currentSeasonId === null && activeSeason) {
      currentSeasonId = activeSeason.id;
    } else if (seasons.length > 0) {
      currentSeasonId = seasons[0].id;
    }
  }

  // Get the appropriate leaderboard data
  let teams: {
    id: number;
    name: string;
    totalPoints: number;
    wins: number;
    losses: number;
    ties: number;
    handicap: number;
    roundsPlayed: number;
    rankChange: number | null;
    handicapChange: number | null;
  }[] = [];

  if (showAllTime) {
    const allTimeStats = await getAllTimeLeaderboard(league.id);
    teams = allTimeStats.map((stat, index) => ({
      id: index, // Use index as ID for all-time stats since they're aggregated
      name: stat.name,
      totalPoints: stat.totalPoints,
      wins: stat.wins,
      losses: stat.losses,
      ties: stat.ties,
      handicap: 0, // No handicap for all-time view
      roundsPlayed: stat.matchCount,
      rankChange: null,
      handicapChange: null,
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
      roundsPlayed: team.wins + team.losses + team.ties,
      rankChange: null, // TODO: Add movement tracking for season leaderboard
      handicapChange: null,
    }));
  }

  const currentSeason = currentSeasonId
    ? seasons.find((s) => s.id === currentSeasonId)
    : null;

  return (
    <div className="min-h-screen bg-bg-primary">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="mb-6 flex items-center justify-between">
          <Link
            href={`/league/${slug}`}
            className="text-green-primary hover:text-green-dark"
          >
            &larr; Back to {league.name}
          </Link>
          <Link
            href={`/league/${slug}/handicap-history${currentSeasonId ? `?seasonId=${currentSeasonId}` : ""}`}
            className="text-green-primary hover:text-green-dark text-sm"
          >
            View Handicap History &rarr;
          </Link>
        </div>

        <div className="flex items-center justify-between mb-2">
          <h1 className="text-3xl font-bold text-green-dark">Leaderboard</h1>
          {seasons.length > 0 && (
            <SeasonSelector
              seasons={seasons}
              currentSeasonId={currentSeasonId}
              leagueSlug={slug}
              showAllTime={true}
            />
          )}
        </div>
        <p className="text-gray-600 mb-8">
          {league.name}
          {currentSeason && !showAllTime && ` - ${currentSeason.name}`}
          {showAllTime && " - All-Time Stats"}
        </p>

        {seasons.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-8 text-center">
            <p className="text-gray-500">No seasons have been created yet.</p>
            <p className="text-gray-400 text-sm mt-2">
              The league admin needs to create a season before teams can register.
            </p>
          </div>
        ) : teams.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-8 text-center">
            <p className="text-gray-500">
              {showAllTime
                ? "No teams have played any matches yet."
                : "No teams have been approved for this season yet."}
            </p>
          </div>
        ) : (
          <LeaderboardTable
            teams={teams}
            leagueSlug={slug}
            hideMovement={showAllTime}
          />
        )}
      </div>
    </div>
  );
}
