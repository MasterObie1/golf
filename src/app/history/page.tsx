import Image from "next/image";
import { getMatchupHistory } from "@/lib/actions";
import { ScoreCard } from "@/components/ScoreCard";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function HistoryPage() {
  const matchups = await getMatchupHistory();

  // Group matchups by week
  const matchupsByWeek = matchups.reduce((acc, matchup) => {
    const week = matchup.weekNumber;
    if (!acc[week]) {
      acc[week] = [];
    }
    acc[week].push(matchup);
    return acc;
  }, {} as Record<number, typeof matchups>);

  const weeks = Object.keys(matchupsByWeek)
    .map(Number)
    .sort((a, b) => b - a);

  return (
    <div className="min-h-screen bg-[var(--masters-cream)]">
      {/* Header Banner */}
      <div className="relative h-48 md:h-64">
        <Image
          src="https://images.unsplash.com/photo-1592919505780-303950717480?w=1920&q=80"
          alt="Golf flag on green"
          fill
          className="object-cover"
          priority
        />
        <div className="absolute inset-0 bg-gradient-to-b from-[var(--masters-green)]/70 to-[var(--masters-green)]/90" />
        <div className="absolute inset-0 flex items-center justify-center">
          <h1 className="text-4xl md:text-5xl font-bold text-white font-[family-name:var(--font-playfair)] drop-shadow-lg">
            Match History
          </h1>
        </div>
        {/* Navigation */}
        <div className="absolute top-4 right-4 flex gap-3">
          <Link
            href="/"
            className="px-4 py-2 bg-white/90 text-[var(--masters-green)] rounded-lg hover:bg-white text-sm font-medium shadow"
          >
            Home
          </Link>
          <Link
            href="/leaderboard"
            className="px-4 py-2 bg-white/90 text-[var(--masters-green)] rounded-lg hover:bg-white text-sm font-medium shadow"
          >
            Leaderboard
          </Link>
          <Link
            href="/admin"
            className="px-4 py-2 bg-[var(--masters-yellow)] text-[var(--masters-green-dark)] rounded-lg hover:bg-[var(--masters-yellow-light)] text-sm font-medium shadow"
          >
            Admin
          </Link>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 py-8 -mt-8">
        {weeks.length === 0 ? (
          <div className="bg-white rounded-lg shadow-lg p-8 text-center text-[var(--text-light)] border border-[var(--masters-green)]/20">
            No matchups yet. Add matchups in the Admin page.
          </div>
        ) : (
          weeks.map((week) => (
            <ScoreCard
              key={week}
              weekNumber={week}
              matchups={matchupsByWeek[week].map((m) => ({
                id: m.id,
                teamA: {
                  name: m.teamA.name,
                  gross: m.teamAGross,
                  handicap: m.teamAHandicap,
                  net: m.teamANet,
                  points: m.teamAPoints,
                  isSub: m.teamAIsSub,
                },
                teamB: {
                  name: m.teamB.name,
                  gross: m.teamBGross,
                  handicap: m.teamBHandicap,
                  net: m.teamBNet,
                  points: m.teamBPoints,
                  isSub: m.teamBIsSub,
                },
                isForfeit: m.isForfeit,
                forfeitTeamId: m.forfeitTeamId,
                teamAId: m.teamAId,
                teamBId: m.teamBId,
              }))}
            />
          ))
        )}
      </div>
    </div>
  );
}
