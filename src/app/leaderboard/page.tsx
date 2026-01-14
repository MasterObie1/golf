import Image from "next/image";
import { getLeaderboard } from "@/lib/actions";
import { LeaderboardTable } from "@/components/LeaderboardTable";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function LeaderboardPage() {
  const teams = await getLeaderboard();

  // Calculate rounds played for each team (wins + losses + ties)
  const teamsWithRounds = teams.map((team) => ({
    ...team,
    roundsPlayed: team.wins + team.losses + team.ties,
  }));

  return (
    <div className="min-h-screen bg-[var(--masters-cream)]">
      {/* Header Banner */}
      <div className="relative h-48 md:h-64">
        <Image
          src="https://images.unsplash.com/photo-1535131749006-b7f58c99034b?w=1920&q=80"
          alt="Golf course green"
          fill
          className="object-cover"
          priority
        />
        <div className="absolute inset-0 bg-gradient-to-b from-[var(--masters-green)]/70 to-[var(--masters-green)]/90" />
        <div className="absolute inset-0 flex items-center justify-center">
          <h1 className="text-4xl md:text-5xl font-bold text-white font-[family-name:var(--font-playfair)] drop-shadow-lg">
            Leaderboard
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
            href="/history"
            className="px-4 py-2 bg-white/90 text-[var(--masters-green)] rounded-lg hover:bg-white text-sm font-medium shadow"
          >
            History
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
        <LeaderboardTable teams={teamsWithRounds} />

        {teamsWithRounds.length > 0 && (
          <p className="mt-4 text-sm text-[var(--text-light)] text-center">
            Sorted by Total Points, then Wins
          </p>
        )}
      </div>
    </div>
  );
}
