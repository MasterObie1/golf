import Link from "next/link";

interface Team {
  id: number;
  name: string;
  totalPoints: number;
  wins: number;
  losses: number;
  ties: number;
  roundsPlayed: number;
  handicap: number;
  rankChange?: number | null;
  handicapChange?: number | null;
}

interface LeaderboardTableProps {
  teams: Team[];
  leagueSlug: string;
  hideMovement?: boolean;
}

function MovementIndicator({ change, inverted = false, label }: { change: number | null | undefined; inverted?: boolean; label: string }) {
  if (change === null || change === undefined) {
    return null;
  }

  if (change === 0) {
    return (
      <span className="inline-flex items-center text-xs text-gray-400 ml-1" aria-label={`${label} unchanged`}>
        —
      </span>
    );
  }

  // For rank: positive change = moved up = good (green)
  // For handicap: we might want inverted logic where lower handicap = better
  const isPositive = inverted ? change < 0 : change > 0;
  const absChange = Math.abs(change);
  const direction = isPositive ? "up" : "down";

  if (isPositive) {
    return (
      <span className="inline-flex items-center text-xs text-green-600 ml-1" role="img" aria-label={`${label} ${direction} ${absChange}`}>
        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
          <path fillRule="evenodd" d="M5.293 9.707a1 1 0 010-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 01-1.414 1.414L11 7.414V15a1 1 0 11-2 0V7.414L6.707 9.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
        </svg>
        <span className="font-medium">{absChange}</span>
      </span>
    );
  } else {
    return (
      <span className="inline-flex items-center text-xs text-red-600 ml-1" role="img" aria-label={`${label} ${direction} ${absChange}`}>
        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
          <path fillRule="evenodd" d="M14.707 10.293a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 111.414-1.414L9 12.586V5a1 1 0 012 0v7.586l2.293-2.293a1 1 0 011.414 0z" clipRule="evenodd" />
        </svg>
        <span className="font-medium">{absChange}</span>
      </span>
    );
  }
}

export function LeaderboardTable({ teams, leagueSlug, hideMovement = false }: LeaderboardTableProps) {
  return (
    <div className="bg-white rounded-lg shadow-lg overflow-hidden border border-[var(--green-primary)]/20">
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <caption className="sr-only">League standings showing team rankings, handicaps, and match records</caption>
          <thead className="bg-[var(--green-primary)] text-white">
            <tr>
              <th scope="col" className="py-4 px-4 font-semibold">Rank</th>
              <th scope="col" className="py-4 px-4 font-semibold">Team Name</th>
              <th scope="col" className="py-4 px-4 text-center font-semibold">Hcp</th>
              <th scope="col" className="py-4 px-4 text-center font-semibold">Rounds</th>
              <th scope="col" className="py-4 px-4 text-center font-semibold">Points</th>
              <th scope="col" className="py-4 px-4 text-center font-semibold">W</th>
              <th scope="col" className="py-4 px-4 text-center font-semibold">L</th>
              <th scope="col" className="py-4 px-4 text-center font-semibold">T</th>
            </tr>
          </thead>
          <tbody className="text-[var(--text-primary)]">
            {teams.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-8 text-center text-[var(--text-light)]">
                  No teams yet. Add teams and matchups in the Admin page.
                </td>
              </tr>
            ) : (
              teams.map((team, index) => (
                <tr
                  key={team.id}
                  className={`border-b border-[var(--border-light)] transition-colors hover:bg-[var(--bg-primary)] ${
                    index === 0
                      ? "bg-[var(--gold-primary)]/20"
                      : index === 1
                      ? "bg-[var(--border-light)]/50"
                      : index === 2
                      ? "bg-[var(--gold-dark)]/10"
                      : ""
                  }`}
                >
                  <td className="py-4 px-4">
                    <div className="flex items-center">
                      <span
                        className={`inline-flex items-center justify-center w-8 h-8 rounded-full font-bold ${
                          index === 0
                            ? "bg-[var(--gold-primary)] text-[var(--green-dark)]"
                            : index === 1
                            ? "bg-[#C0C0C0] text-[var(--text-secondary)]"
                            : index === 2
                            ? "bg-[var(--gold-dark)] text-white"
                            : "text-[var(--text-muted)]"
                        }`}
                      >
                        {index + 1}
                      </span>
                      {!hideMovement && <MovementIndicator change={team.rankChange} label="Rank" />}
                    </div>
                  </td>
                  <td className="py-4 px-4 font-medium">
                    <Link
                      href={`/league/${leagueSlug}/team/${team.id}`}
                      className="text-[var(--green-primary)] hover:text-[var(--green-dark)] hover:underline"
                    >
                      {team.name}
                    </Link>
                  </td>
                  <td className="py-4 px-4 text-center">
                    <div className="inline-flex items-center">
                      <span className="text-[var(--gold-dark)]">{team.handicap}</span>
                      {!hideMovement && <MovementIndicator change={team.handicapChange} inverted={true} label="Handicap" />}
                    </div>
                  </td>
                  <td className="py-4 px-4 text-center">{team.roundsPlayed}</td>
                  <td className="py-4 px-4 text-center font-bold text-[var(--green-primary)]">
                    {team.totalPoints}
                  </td>
                  <td className="py-4 px-4 text-center text-[var(--green-primary)]">
                    {team.wins}
                  </td>
                  <td className="py-4 px-4 text-center text-[var(--error)]">
                    {team.losses}
                  </td>
                  <td className="py-4 px-4 text-center text-[var(--text-light)]">
                    {team.ties}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
