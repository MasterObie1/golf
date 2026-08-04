"use client";

import { useState, useMemo, useCallback } from "react";
import { CircleCheck, ChevronRight, Loader2 } from "lucide-react";
import { getPublicScorecardForTeamWeek } from "@/lib/actions/scorecards";
import type { ScorecardDetail } from "@/lib/actions/scorecards";
import ScorecardGrid from "./ScorecardGrid";

interface TeamScore {
  name: string;
  gross: number;
  handicap: number;
  net: number;
  points: number;
  isSub: boolean;
}

interface Matchup {
  id: number;
  teamA: TeamScore;
  teamB: TeamScore;
  isForfeit?: boolean;
  forfeitTeamId?: number | null;
  teamAId?: number;
  teamBId?: number;
}

interface MatchupResultsProps {
  weekNumber: number;
  matchups: Matchup[];
  /** When provided, team rows with available scorecards become expandable. */
  scorecards?: {
    leagueId: number;
    availability: { weekNumber: number; teamId: number }[];
  };
}

export function MatchupResults({
  weekNumber,
  matchups,
  scorecards,
}: MatchupResultsProps) {
  // Convert raw availability to a Set for O(1) lookups
  const availableSet = useMemo(() => {
    const set = new Set<string>();
    for (const item of scorecards?.availability ?? []) {
      set.add(`${item.weekNumber}-${item.teamId}`);
    }
    return set;
  }, [scorecards?.availability]);

  // Track which team row is expanded: "matchupId-teamId"
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  // Cache fetched scorecards by "weekNumber-teamId"
  const [scorecardCache, setScorecardCache] = useState<Record<string, ScorecardDetail>>({});
  const [loading, setLoading] = useState<string | null>(null);

  const leagueId = scorecards?.leagueId;

  const hasScorecard = useCallback(
    (teamId: number | undefined) => {
      if (!teamId || leagueId === undefined) return false;
      return availableSet.has(`${weekNumber}-${teamId}`);
    },
    [availableSet, weekNumber, leagueId]
  );

  const handleToggle = useCallback(
    async (matchupId: number, teamId: number) => {
      if (leagueId === undefined) return;
      const key = `${matchupId}-${teamId}`;
      if (expandedKey === key) {
        setExpandedKey(null);
        return;
      }

      setExpandedKey(key);

      const cacheKey = `${weekNumber}-${teamId}`;
      if (scorecardCache[cacheKey]) return;

      setLoading(key);
      try {
        const detail = await getPublicScorecardForTeamWeek(leagueId, weekNumber, teamId);
        if (detail) {
          setScorecardCache((prev) => ({ ...prev, [cacheKey]: detail }));
        }
      } finally {
        setLoading(null);
      }
    },
    [expandedKey, scorecardCache, leagueId, weekNumber]
  );

  function renderTeamRow(
    matchup: Matchup,
    team: TeamScore,
    teamId: number | undefined,
    side: "A" | "B"
  ) {
    const isTop = side === "A";
    const teamHasScorecard = hasScorecard(teamId);
    const key = teamId ? `${matchup.id}-${teamId}` : null;
    const isExpanded = key !== null && expandedKey === key;
    const isLoading = key !== null && loading === key;
    const cacheKey = teamId ? `${weekNumber}-${teamId}` : null;
    const cachedScorecard = cacheKey ? scorecardCache[cacheKey] : null;

    return (
      <>
        <div
          className={`flex items-center justify-between py-3 px-4 ${
            isTop
              ? "bg-bunker/20 dark:bg-white/5 rounded-t-lg border border-b-0 border-scorecard-line/30"
              : "bg-scorecard-paper rounded-b-lg border border-scorecard-line/30"
          } ${teamHasScorecard ? "cursor-pointer hover:bg-bunker/30 dark:hover:bg-white/10 transition-colors" : ""}`}
          onClick={
            teamHasScorecard && teamId
              ? () => handleToggle(matchup.id, teamId)
              : undefined
          }
        >
          <div className="flex items-center gap-3">
            {teamHasScorecard && (
              <ChevronRight
                className={`w-4 h-4 text-primary transition-transform duration-200 ${
                  isExpanded ? "rotate-90" : ""
                }`}
                strokeWidth={2.5}
                aria-hidden
              />
            )}
            <span className="font-medium text-scorecard-pencil font-sans">
              {team.name}
            </span>
            {team.isSub && (
              <span className="px-2 py-0.5 text-xs bg-warning-bg text-warning-text rounded font-display font-medium uppercase tracking-wider">
                Sub
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 sm:gap-6 text-sm">
            <div className="hidden sm:block text-center">
              <div className="text-text-light text-xs font-display uppercase tracking-wider">Gross</div>
              <div className="font-mono font-medium tabular-nums">{team.gross}</div>
            </div>
            <div className="text-center">
              <div className="text-text-light text-xs font-display uppercase tracking-wider">Hcp</div>
              <div className="font-mono font-medium tabular-nums">{team.handicap}</div>
            </div>
            <div className="text-center">
              <div className="text-text-light text-xs font-display uppercase tracking-wider">Net</div>
              <div className="font-mono font-semibold tabular-nums">{team.net.toFixed(1)}</div>
            </div>
            <div className="text-center min-w-[50px]">
              <div className="text-text-light text-xs font-display uppercase tracking-wider">Pts</div>
              <div className="font-mono font-bold text-primary text-lg tabular-nums">
                {team.points}
              </div>
            </div>
          </div>
        </div>

        {/* Expanded scorecard */}
        {isExpanded && (
          <div className="border-x border-scorecard-line/30 bg-surface/50 px-4 py-3">
            {isLoading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="animate-spin h-5 w-5 text-primary" aria-hidden />
                <span className="ml-2 text-sm text-text-secondary font-sans">Loading scorecard...</span>
              </div>
            ) : cachedScorecard ? (
              <ScorecardGrid
                holes={cachedScorecard.course.holes}
                holeScores={cachedScorecard.holeScores}
                courseName={cachedScorecard.course.name}
                totalPar={cachedScorecard.course.totalPar}
                grossTotal={cachedScorecard.grossTotal}
                frontNine={cachedScorecard.frontNine}
                backNine={cachedScorecard.backNine}
                compact={true}
              />
            ) : (
              <p className="text-sm text-text-muted font-sans text-center py-4">
                Scorecard not available.
              </p>
            )}
          </div>
        )}
      </>
    );
  }

  return (
    <div className="bg-scorecard-paper rounded-lg shadow-md overflow-hidden border border-scorecard-line/50 mb-6">
      {/* Week Header */}
      <div className="dark bg-rough text-board-yellow px-6 py-3">
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
                            <span className="text-primary">{winner.name}</span>
                            {" wins by forfeit (20 pts)"}
                          </p>
                          <p className="text-sm text-board-red dark:text-error font-sans">
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
                {renderTeamRow(matchup, matchup.teamA, matchup.teamAId, "A")}
                {renderTeamRow(matchup, matchup.teamB, matchup.teamBId, "B")}

                {/* Winner indicator */}
                {matchup.teamA.points !== matchup.teamB.points && (
                  <div className="mt-2 text-center">
                    <span className="inline-flex items-center gap-1 px-3 py-1 bg-board-yellow/15 text-scorecard-pencil text-sm rounded-full font-sans font-medium">
                      <CircleCheck className="w-4 h-4 text-primary" aria-hidden />
                      {matchup.teamA.points > matchup.teamB.points
                        ? matchup.teamA.name
                        : matchup.teamB.name}{" "}
                      wins
                    </span>
                  </div>
                )}
                {matchup.teamA.points === matchup.teamB.points && (
                  <div className="mt-2 text-center">
                    <span className="inline-flex items-center gap-1 px-3 py-1 bg-bunker/20 dark:bg-white/10 text-text-muted text-sm rounded-full font-sans font-medium">
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
