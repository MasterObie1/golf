import Link from "next/link";
import { notFound } from "next/navigation";
import { getLeagueBySlug, getMatchupHistory } from "@/lib/actions";
import { ScoreCard } from "@/components/ScoreCard";

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function LeagueHistoryPage({ params }: Props) {
  const { slug } = await params;

  const league = await getLeagueBySlug(slug);
  if (!league) {
    notFound();
  }

  const matchups = await getMatchupHistory(league.id);

  // Group matchups by week and transform to ScoreCard format
  const matchupsByWeek = matchups.reduce(
    (acc, matchup) => {
      if (!acc[matchup.weekNumber]) {
        acc[matchup.weekNumber] = [];
      }
      // Transform to ScoreCard format
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

  return (
    <div className="min-h-screen bg-green-50">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="mb-6">
          <Link
            href={`/league/${slug}`}
            className="text-green-600 hover:text-green-700"
          >
            &larr; Back to {league.name}
          </Link>
        </div>

        <h1 className="text-3xl font-bold text-green-800 mb-2">Match History</h1>
        <p className="text-gray-600 mb-8">{league.name}</p>

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
