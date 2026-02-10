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
    <div className="bg-scorecard-paper rounded-lg shadow-md overflow-hidden border border-scorecard-line/50 mb-6">
      {/* Week Header */}
      <div className="bg-rough text-board-yellow px-6 py-3">
        <h2 className="text-lg font-display font-semibold uppercase tracking-wider">
          Round {weekNumber}
        </h2>
      </div>

      {/* Matchups */}
      <div className="divide-y divide-scorecard-line/40">
        {matchups.map((matchup) => (
          <div key={matchup.id} className="p-4">
            {matchup.isForfeit ? (
              (() => {
                const forfeitedTeamA = matchup.forfeitTeamId === matchup.teamAId;
                const winner = forfeitedTeamA ? matchup.teamB : matchup.teamA;
                const forfeiter = forfeitedTeamA ? matchup.teamA : matchup.teamB;

                return (
                  <div className="bg-error-bg border border-error-border rounded-lg p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="px-2 py-1 text-xs font-display font-bold bg-board-red text-white rounded uppercase tracking-wider">
                          Forfeit
                        </span>
                        <div className="mt-2 space-y-1">
                          <p className="font-medium text-scorecard-pencil font-sans">
                            <span className="text-fairway">{winner.name}</span>
                            {" wins by forfeit (20 pts)"}
                          </p>
                          <p className="text-sm text-board-red font-sans">
                            {forfeiter.name} forfeited (0 pts)
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()
            ) : (
              <>
                {/* Team A */}
                <div className="flex items-center justify-between py-3 px-4 bg-bunker/20 rounded-t-lg border border-b-0 border-scorecard-line/30">
                  <div className="flex items-center gap-3">
                    <span className="font-medium text-scorecard-pencil font-sans">
                      {matchup.teamA.name}
                    </span>
                    {matchup.teamA.isSub && (
                      <span className="px-2 py-0.5 text-xs bg-warning-bg text-warning-text rounded font-display font-medium uppercase tracking-wider">
                        Sub
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-6 text-sm">
                    <div className="text-center">
                      <div className="text-text-light text-xs font-display uppercase tracking-wider">Gross</div>
                      <div className="font-mono font-medium tabular-nums">{matchup.teamA.gross}</div>
                    </div>
                    <div className="text-center">
                      <div className="text-text-light text-xs font-display uppercase tracking-wider">Hcp</div>
                      <div className="font-mono font-medium tabular-nums">{matchup.teamA.handicap}</div>
                    </div>
                    <div className="text-center">
                      <div className="text-text-light text-xs font-display uppercase tracking-wider">Net</div>
                      <div className="font-mono font-semibold tabular-nums">{matchup.teamA.net.toFixed(1)}</div>
                    </div>
                    <div className="text-center min-w-[50px]">
                      <div className="text-text-light text-xs font-display uppercase tracking-wider">Pts</div>
                      <div className="font-mono font-bold text-fairway text-lg tabular-nums">
                        {matchup.teamA.points}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Team B */}
                <div className="flex items-center justify-between py-3 px-4 bg-scorecard-paper rounded-b-lg border border-scorecard-line/30">
                  <div className="flex items-center gap-3">
                    <span className="font-medium text-scorecard-pencil font-sans">
                      {matchup.teamB.name}
                    </span>
                    {matchup.teamB.isSub && (
                      <span className="px-2 py-0.5 text-xs bg-warning-bg text-warning-text rounded font-display font-medium uppercase tracking-wider">
                        Sub
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-6 text-sm">
                    <div className="text-center">
                      <div className="text-text-light text-xs font-display uppercase tracking-wider">Gross</div>
                      <div className="font-mono font-medium tabular-nums">{matchup.teamB.gross}</div>
                    </div>
                    <div className="text-center">
                      <div className="text-text-light text-xs font-display uppercase tracking-wider">Hcp</div>
                      <div className="font-mono font-medium tabular-nums">{matchup.teamB.handicap}</div>
                    </div>
                    <div className="text-center">
                      <div className="text-text-light text-xs font-display uppercase tracking-wider">Net</div>
                      <div className="font-mono font-semibold tabular-nums">{matchup.teamB.net.toFixed(1)}</div>
                    </div>
                    <div className="text-center min-w-[50px]">
                      <div className="text-text-light text-xs font-display uppercase tracking-wider">Pts</div>
                      <div className="font-mono font-bold text-fairway text-lg tabular-nums">
                        {matchup.teamB.points}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Winner indicator */}
                {matchup.teamA.points !== matchup.teamB.points && (
                  <div className="mt-2 text-center">
                    <span className="inline-flex items-center gap-1 px-3 py-1 bg-board-yellow/15 text-scorecard-pencil text-sm rounded-full font-sans font-medium">
                      <svg className="w-4 h-4 text-fairway" fill="currentColor" viewBox="0 0 20 20">
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
                    <span className="inline-flex items-center gap-1 px-3 py-1 bg-bunker/20 text-text-muted text-sm rounded-full font-sans font-medium">
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
