interface TeamScore {
  name: string;
  gross: number;
  handicap: number;
  net: number;
  points: number;
  isSub: boolean;
}

interface ScoreCardProps {
  weekNumber: number;
  matchups: {
    id: number;
    teamA: TeamScore;
    teamB: TeamScore;
    isForfeit?: boolean;
    forfeitTeamId?: number | null;
    teamAId?: number;
    teamBId?: number;
  }[];
}

export function ScoreCard({ weekNumber, matchups }: ScoreCardProps) {
  return (
    <div className="bg-white rounded-lg shadow-lg overflow-hidden border border-[var(--masters-green)]/20 mb-6">
      {/* Week Header */}
      <div className="bg-[var(--masters-green)] text-white px-6 py-4">
        <h2 className="text-xl font-semibold font-[var(--font-playfair)]">
          Week {weekNumber}
        </h2>
      </div>

      {/* Matchups */}
      <div className="divide-y divide-[var(--border-light)]">
        {matchups.map((matchup) => (
          <div key={matchup.id} className="p-4">
            {matchup.isForfeit ? (
              /* Forfeit Display */
              <div className="bg-[var(--error-bg)] border border-[var(--error-border)] rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="px-2 py-1 text-xs font-bold bg-[var(--masters-burgundy)] text-white rounded uppercase">
                      Forfeit
                    </span>
                    <div className="mt-2 space-y-1">
                      <p className="font-medium text-[var(--text-primary)]">
                        <span className="text-[var(--masters-green)]">{matchup.teamA.name}</span>
                        {" wins by forfeit (20 pts)"}
                      </p>
                      <p className="text-sm text-[var(--masters-burgundy)]">
                        {matchup.teamB.name} forfeited (0 pts)
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              /* Regular Matchup Display */
              <>
                {/* Team A */}
                <div className="flex items-center justify-between py-3 px-4 bg-[var(--masters-cream)] rounded-t-lg border border-b-0 border-[var(--border-light)]">
                  <div className="flex items-center gap-3">
                    <span className="font-medium text-[var(--text-primary)]">
                      {matchup.teamA.name}
                    </span>
                    {matchup.teamA.isSub && (
                      <span className="px-2 py-0.5 text-xs bg-[var(--warning-bg)] text-[var(--warning-text)] rounded font-medium">
                        SUB
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-6 text-sm">
                    <div className="text-center">
                      <div className="text-[var(--text-light)] text-xs uppercase">Gross</div>
                      <div className="font-medium">{matchup.teamA.gross}</div>
                    </div>
                    <div className="text-center">
                      <div className="text-[var(--text-light)] text-xs uppercase">Hcp</div>
                      <div className="font-medium">{matchup.teamA.handicap}</div>
                    </div>
                    <div className="text-center">
                      <div className="text-[var(--text-light)] text-xs uppercase">Net</div>
                      <div className="font-semibold">{matchup.teamA.net.toFixed(1)}</div>
                    </div>
                    <div className="text-center min-w-[50px]">
                      <div className="text-[var(--text-light)] text-xs uppercase">Pts</div>
                      <div className="font-bold text-[var(--masters-green)] text-lg">
                        {matchup.teamA.points}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Team B */}
                <div className="flex items-center justify-between py-3 px-4 bg-white rounded-b-lg border border-[var(--border-light)]">
                  <div className="flex items-center gap-3">
                    <span className="font-medium text-[var(--text-primary)]">
                      {matchup.teamB.name}
                    </span>
                    {matchup.teamB.isSub && (
                      <span className="px-2 py-0.5 text-xs bg-[var(--warning-bg)] text-[var(--warning-text)] rounded font-medium">
                        SUB
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-6 text-sm">
                    <div className="text-center">
                      <div className="text-[var(--text-light)] text-xs uppercase">Gross</div>
                      <div className="font-medium">{matchup.teamB.gross}</div>
                    </div>
                    <div className="text-center">
                      <div className="text-[var(--text-light)] text-xs uppercase">Hcp</div>
                      <div className="font-medium">{matchup.teamB.handicap}</div>
                    </div>
                    <div className="text-center">
                      <div className="text-[var(--text-light)] text-xs uppercase">Net</div>
                      <div className="font-semibold">{matchup.teamB.net.toFixed(1)}</div>
                    </div>
                    <div className="text-center min-w-[50px]">
                      <div className="text-[var(--text-light)] text-xs uppercase">Pts</div>
                      <div className="font-bold text-[var(--masters-green)] text-lg">
                        {matchup.teamB.points}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Winner indicator */}
                {matchup.teamA.points !== matchup.teamB.points && (
                  <div className="mt-2 text-center">
                    <span className="inline-flex items-center gap-1 px-3 py-1 bg-[var(--masters-yellow)]/20 text-[var(--masters-green-dark)] text-sm rounded-full font-medium">
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                      {matchup.teamA.points > matchup.teamB.points
                        ? matchup.teamA.name
                        : matchup.teamB.name}{" "}
                      wins
                    </span>
                  </div>
                )}
                {matchup.teamA.points === matchup.teamB.points && (
                  <div className="mt-2 text-center">
                    <span className="inline-flex items-center gap-1 px-3 py-1 bg-[var(--border-light)] text-[var(--text-muted)] text-sm rounded-full font-medium">
                      Tie
                    </span>
                  </div>
                )}
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
