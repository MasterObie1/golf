import Link from "next/link";
import { notFound } from "next/navigation";
import { getLeagueBySlug, getTeamById, getTeamMatchupHistory } from "@/lib/actions";
import { ScoreCard } from "@/components/ScoreCard";
import type { Metadata } from "next";

interface Props {
  params: Promise<{ slug: string; teamId: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, teamId } = await params;
  const teamIdNum = parseInt(teamId, 10);
  if (isNaN(teamIdNum)) return { title: "Team" };

  const [league, team] = await Promise.all([
    getLeagueBySlug(slug),
    getTeamById(teamIdNum),
  ]);
  if (!league || !team) return { title: "Team" };
  return {
    title: `${team.name} - ${league.name}`,
    description: `Match history and stats for ${team.name} in ${league.name}`,
  };
}

export default async function TeamHistoryPage({ params }: Props) {
  const { slug, teamId } = await params;
  const teamIdNum = parseInt(teamId, 10);

  if (isNaN(teamIdNum)) {
    notFound();
  }

  const league = await getLeagueBySlug(slug);
  if (!league) {
    notFound();
  }

  const team = await getTeamById(teamIdNum);
  if (!team || team.leagueId !== league.id) {
    notFound();
  }

  const matchups = await getTeamMatchupHistory(league.id, teamIdNum);

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

  // Calculate stats
  const totalPoints = matchups.reduce((sum, m) => {
    if (m.teamAId === teamIdNum) return sum + m.teamAPoints;
    return sum + m.teamBPoints;
  }, 0);

  return (
    <div className="min-h-screen bg-bg-primary">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="mb-6">
          <Link
            href={`/league/${slug}/leaderboard`}
            className="text-green-primary hover:text-green-dark"
          >
            &larr; Back to Leaderboard
          </Link>
        </div>

        <h1 className="text-3xl font-bold text-green-dark mb-2">{team.name}</h1>
        <p className="text-gray-600 mb-4">{league.name}</p>

        {/* Team Stats Summary */}
        <div className="bg-white rounded-lg shadow p-6 mb-8">
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 text-center">
            <div>
              <div className="text-2xl font-bold text-green-primary">{totalPoints}</div>
              <div className="text-sm text-gray-500">Total Points</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-success">{team.wins}</div>
              <div className="text-sm text-gray-500">Wins</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-red-600">{team.losses}</div>
              <div className="text-sm text-gray-500">Losses</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-gray-600">{team.ties}</div>
              <div className="text-sm text-gray-500">Ties</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-gray-700">{matchups.length}</div>
              <div className="text-sm text-gray-500">Matches</div>
            </div>
          </div>
        </div>

        <h2 className="text-xl font-semibold text-green-dark mb-4">Match History</h2>

        {matchups.length === 0 ? (
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
