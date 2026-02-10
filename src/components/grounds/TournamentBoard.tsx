"use client";

import { BoardRow } from "./BoardRow";

interface Team {
  id: number;
  name: string;
  totalPoints: number;
  wins: number;
  losses: number;
  ties: number;
  roundsPlayed: number;
  handicap: number | null;
  rankChange?: number | null;
  handicapChange?: number | null;
  avgNet?: number;
  bestFinish?: number;
  matchPoints?: number;
  fieldPoints?: number;
}

interface TournamentBoardProps {
  teams: Team[];
  leagueSlug: string;
  scoringType?: "match_play" | "stroke_play" | "hybrid";
  hideMovement?: boolean;
  proRate?: boolean;
}

export function TournamentBoard({
  teams,
  leagueSlug,
  scoringType = "match_play",
  hideMovement = false,
  proRate = false,
}: TournamentBoardProps) {
  const isMatchPlay = scoringType === "match_play";
  const isStrokePlay = scoringType === "stroke_play";
  const isHybrid = scoringType === "hybrid";
  const pointsLabel = proRate ? "Pts/Rd" : "Points";
  const colCount = isHybrid ? 10 : isStrokePlay ? 7 : 8;

  return (
    <div className="bg-scorecard-paper rounded-lg shadow-md overflow-hidden border border-scorecard-line/50">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">
            League standings showing team rankings
            {isMatchPlay && ", handicaps, and match records"}
            {isStrokePlay && ", handicaps, and scoring averages"}
            {isHybrid && ", handicaps, match and field points"}
          </caption>
          <thead className="bg-rough text-white">
            <tr>
              <th scope="col" className="py-3 px-4 font-display font-semibold uppercase tracking-wider text-xs">
                Pos
              </th>
              <th scope="col" className="py-3 px-4 font-display font-semibold uppercase tracking-wider text-xs">
                Player
              </th>
              <th scope="col" className="py-3 px-4 text-center font-display font-semibold uppercase tracking-wider text-xs">
                Hcp
              </th>
              <th scope="col" className="py-3 px-4 text-center font-display font-semibold uppercase tracking-wider text-xs">
                Rds
              </th>
              <th scope="col" className="py-3 px-4 text-center font-display font-semibold uppercase tracking-wider text-xs bg-fairway">
                {pointsLabel}
              </th>
              {isMatchPlay && (
                <>
                  <th scope="col" className="py-3 px-4 text-center font-display font-semibold uppercase tracking-wider text-xs">W</th>
                  <th scope="col" className="py-3 px-4 text-center font-display font-semibold uppercase tracking-wider text-xs">L</th>
                  <th scope="col" className="py-3 px-4 text-center font-display font-semibold uppercase tracking-wider text-xs">T</th>
                </>
              )}
              {isStrokePlay && (
                <>
                  <th scope="col" className="py-3 px-4 text-center font-display font-semibold uppercase tracking-wider text-xs">Avg Net</th>
                  <th scope="col" className="py-3 px-4 text-center font-display font-semibold uppercase tracking-wider text-xs">Best</th>
                </>
              )}
              {isHybrid && (
                <>
                  <th scope="col" className="py-3 px-4 text-center font-display font-semibold uppercase tracking-wider text-xs">Match</th>
                  <th scope="col" className="py-3 px-4 text-center font-display font-semibold uppercase tracking-wider text-xs">Field</th>
                  <th scope="col" className="py-3 px-4 text-center font-display font-semibold uppercase tracking-wider text-xs">W</th>
                  <th scope="col" className="py-3 px-4 text-center font-display font-semibold uppercase tracking-wider text-xs">L</th>
                  <th scope="col" className="py-3 px-4 text-center font-display font-semibold uppercase tracking-wider text-xs">T</th>
                </>
              )}
            </tr>
          </thead>
          <tbody className="text-scorecard-pencil">
            {teams.length === 0 ? (
              <tr>
                <td colSpan={colCount} className="py-8 text-center text-text-muted font-sans">
                  No teams yet. Add teams and {isStrokePlay ? "weekly scores" : "matchups"} in the Admin page.
                </td>
              </tr>
            ) : (
              teams.map((team, index) => (
                <BoardRow
                  key={team.id > 0 ? team.id : `alltime-${index}`}
                  index={index}
                  team={team}
                  leagueSlug={leagueSlug}
                  scoringType={scoringType}
                  hideMovement={hideMovement}
                />
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
