interface Team {
  id: number;
  name: string;
  totalPoints: number;
  wins: number;
  losses: number;
  ties: number;
  roundsPlayed: number;
  handicap: number;
}

interface LeaderboardTableProps {
  teams: Team[];
}

export function LeaderboardTable({ teams }: LeaderboardTableProps) {
  return (
    <div className="bg-white rounded-lg shadow-lg overflow-hidden border border-[var(--masters-green)]/20">
      <table className="w-full text-left">
        <thead className="bg-[var(--masters-green)] text-white">
          <tr>
            <th className="py-4 px-6 font-semibold">Rank</th>
            <th className="py-4 px-6 font-semibold">Team Name</th>
            <th className="py-4 px-6 text-center font-semibold">Hcp</th>
            <th className="py-4 px-6 text-center font-semibold">Rounds</th>
            <th className="py-4 px-6 text-center font-semibold">Points</th>
            <th className="py-4 px-6 text-center font-semibold">W</th>
            <th className="py-4 px-6 text-center font-semibold">L</th>
            <th className="py-4 px-6 text-center font-semibold">T</th>
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
                className={`border-b border-[var(--border-light)] transition-colors hover:bg-[var(--masters-cream)] ${
                  index === 0
                    ? "bg-[var(--masters-yellow)]/20"
                    : index === 1
                    ? "bg-[var(--border-light)]/50"
                    : index === 2
                    ? "bg-[var(--masters-gold)]/10"
                    : ""
                }`}
              >
                <td className="py-4 px-6">
                  <span
                    className={`inline-flex items-center justify-center w-8 h-8 rounded-full font-bold ${
                      index === 0
                        ? "bg-[var(--masters-yellow)] text-[var(--masters-green-dark)]"
                        : index === 1
                        ? "bg-[#C0C0C0] text-[var(--text-secondary)]"
                        : index === 2
                        ? "bg-[var(--masters-gold)] text-white"
                        : "text-[var(--text-muted)]"
                    }`}
                  >
                    {index + 1}
                  </span>
                </td>
                <td className="py-4 px-6 font-medium">{team.name}</td>
                <td className="py-4 px-6 text-center text-[var(--masters-gold)]">{team.handicap}</td>
                <td className="py-4 px-6 text-center">{team.roundsPlayed}</td>
                <td className="py-4 px-6 text-center font-bold text-[var(--masters-green)]">
                  {team.totalPoints}
                </td>
                <td className="py-4 px-6 text-center text-[var(--masters-green)]">
                  {team.wins}
                </td>
                <td className="py-4 px-6 text-center text-[var(--masters-burgundy)]">
                  {team.losses}
                </td>
                <td className="py-4 px-6 text-center text-[var(--text-light)]">
                  {team.ties}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
