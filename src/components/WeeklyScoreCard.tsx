import { formatTiedPosition } from "@/lib/format-utils";

interface WeeklyScoreEntry {
  id: number;
  weekNumber: number;
  team: { id: number; name: string };
  grossScore: number;
  handicap: number;
  netScore: number;
  position: number;
  points: number;
  isSub: boolean;
  isDnp: boolean;
}

interface WeeklyScoreCardProps {
  weekNumber: number;
  scores: WeeklyScoreEntry[];
}

export function WeeklyScoreCard({ weekNumber, scores }: WeeklyScoreCardProps) {
  // Sort: playing teams by position, DNP at bottom
  const sorted = [...scores].sort((a, b) => {
    if (a.isDnp && !b.isDnp) return 1;
    if (!a.isDnp && b.isDnp) return -1;
    return a.position - b.position;
  });

  const positions = sorted.filter((s) => !s.isDnp).map((s) => s.position);

  return (
    <div className="bg-scorecard-paper rounded-lg shadow-md overflow-hidden border border-scorecard-line/50 mb-6">
      {/* Week Header */}
      <div className="bg-rough text-board-yellow px-6 py-3">
        <h2 className="text-lg font-display font-semibold uppercase tracking-wider">
          Week {weekNumber}
        </h2>
      </div>

      {/* Results Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-bunker/30">
            <tr>
              <th className="py-3 px-4 text-left font-display font-semibold text-scorecard-pencil text-xs uppercase tracking-wider w-16">Pos</th>
              <th className="py-3 px-4 text-left font-display font-semibold text-scorecard-pencil text-xs uppercase tracking-wider">Team</th>
              <th className="py-3 px-4 text-center font-display font-semibold text-scorecard-pencil text-xs uppercase tracking-wider">Gross</th>
              <th className="py-3 px-4 text-center font-display font-semibold text-scorecard-pencil text-xs uppercase tracking-wider">Hcp</th>
              <th className="py-3 px-4 text-center font-display font-semibold text-scorecard-pencil text-xs uppercase tracking-wider">Net</th>
              <th className="py-3 px-4 text-center font-display font-semibold text-scorecard-pencil text-xs uppercase tracking-wider">Points</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((score, index) => {
              const isMedal = !score.isDnp && index < 3;
              const medalBg = index === 0
                ? "bg-board-yellow/15"
                : index === 1
                ? "bg-scorecard-line/20"
                : index === 2
                ? "bg-wood/10"
                : "";

              return (
                <tr
                  key={score.id}
                  className={`border-b border-scorecard-line/30 ${
                    score.isDnp ? "bg-bunker/10 text-text-light" : isMedal ? medalBg : ""
                  }`}
                >
                  <td className="py-3 px-4 font-mono tabular-nums">
                    {score.isDnp ? (
                      <span className="text-xs font-display font-medium text-text-light uppercase tracking-wider">DNP</span>
                    ) : (
                      <span className={`font-semibold ${
                        index === 0 ? "text-wood" : "text-scorecard-pencil"
                      }`}>
                        {formatTiedPosition(score.position, positions)}
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-4 font-medium font-sans">
                    <span className={score.isDnp ? "text-text-light" : "text-scorecard-pencil"}>
                      {score.team.name}
                    </span>
                    {score.isSub && (
                      <span className="ml-2 px-2 py-0.5 text-xs bg-warning-bg text-warning-text rounded font-display font-medium uppercase tracking-wider">
                        Sub
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-center font-mono tabular-nums">
                    {score.isDnp ? "\u2014" : score.grossScore}
                  </td>
                  <td className="py-3 px-4 text-center font-mono tabular-nums">
                    {score.isDnp ? "\u2014" : score.handicap}
                  </td>
                  <td className="py-3 px-4 text-center font-mono font-semibold tabular-nums">
                    {score.isDnp ? "\u2014" : score.netScore.toFixed(1)}
                  </td>
                  <td className="py-3 px-4 text-center">
                    <span className={`font-mono font-bold tabular-nums ${score.isDnp ? "text-text-light" : "text-fairway"}`}>
                      {score.points}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
