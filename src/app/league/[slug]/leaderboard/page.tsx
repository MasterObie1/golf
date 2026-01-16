import Link from "next/link";
import { notFound } from "next/navigation";
import { getLeagueBySlug, getLeaderboardWithMovement } from "@/lib/actions";
import { LeaderboardTable } from "@/components/LeaderboardTable";

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function LeagueLeaderboardPage({ params }: Props) {
  const { slug } = await params;

  const league = await getLeagueBySlug(slug);
  if (!league) {
    notFound();
  }

  const teamsData = await getLeaderboardWithMovement(league.id);

  // Transform to add roundsPlayed for the LeaderboardTable component
  const teams = teamsData.map((team) => ({
    id: team.id,
    name: team.name,
    totalPoints: team.totalPoints,
    wins: team.wins,
    losses: team.losses,
    ties: team.ties,
    handicap: team.handicap,
    roundsPlayed: team.wins + team.losses + team.ties,
    rankChange: team.rankChange,
    handicapChange: team.handicapChange,
  }));

  return (
    <div className="min-h-screen bg-green-50">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="mb-6 flex items-center justify-between">
          <Link
            href={`/league/${slug}`}
            className="text-green-600 hover:text-green-700"
          >
            &larr; Back to {league.name}
          </Link>
          <Link
            href={`/league/${slug}/handicap-history`}
            className="text-green-600 hover:text-green-700 text-sm"
          >
            View Handicap History &rarr;
          </Link>
        </div>

        <h1 className="text-3xl font-bold text-green-800 mb-2">Leaderboard</h1>
        <p className="text-gray-600 mb-8">{league.name}</p>

        {teams.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-8 text-center">
            <p className="text-gray-500">No teams have been approved yet.</p>
          </div>
        ) : (
          <LeaderboardTable teams={teams} leagueSlug={slug} />
        )}
      </div>
    </div>
  );
}
