"use client";

import { useState, useMemo, useCallback } from "react";
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

interface MatchupWithScorecardsProps {
  weekNumber: number;
  matchups: Matchup[];
  leagueId: number;
  scorecardAvailabilityRaw: { weekNumber: number; teamId: number; grossTotal: number | null }[];
}

export function MatchupWithScorecards({
  weekNumber,
  matchups,
  leagueId,
  scorecardAvailabilityRaw,
}: MatchupWithScorecardsProps) {
  // Convert raw availability to a Map for O(1) lookups (key → grossTotal)
  const availableMap = useMemo(() => {
    const map = new Map<string, number | null>();
    for (const item of scorecardAvailabilityRaw) {
      map.set(`${item.weekNumber}-${item.teamId}`, item.grossTotal);
    }
    return map;
  }, [scorecardAvailabilityRaw]);

  // Track which team row is expanded: "matchupId-teamAId" or "matchupId-teamBId"
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  // Cache fetched scorecards by "weekNumber-teamId"
  const [scorecardCache, setScorecardCache] = useState<Record<string, ScorecardDetail>>({});
  const [loading, setLoading] = useState<string | null>(null);

  const hasScorecard = useCallback(
    (teamId: number | undefined) => {
      if (!teamId) return false;
      return availableMap.has(`${weekNumber}-${teamId}`);
    },
    [availableMap, weekNumber]
  );

  const getScorecardGross = useCallback(
    (teamId: number | undefined): number | null => {
      if (!teamId) return null;
      return availableMap.get(`${weekNumber}-${teamId}`) ?? null;
    },
    [availableMap, weekNumber]
  );

  const handleToggle = useCallback(
    async (matchupId: number, teamId: number) => {
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
    const scorecardGross = getScorecardGross(teamId);
    const hasMismatch = scorecardGross != null && scorecardGross !== team.gross;
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
              ? "bg-bunker/20 rounded-t-lg border border-b-0 border-scorecard-line/30"
              : "bg-scorecard-paper rounded-b-lg border border-scorecard-line/30"
          } ${teamHasScorecard ? "cursor-pointer hover:bg-bunker/30 transition-colors" : ""}`}
          onClick={
            teamHasScorecard && teamId
              ? () => handleToggle(matchup.id, teamId)
              : undefined
          }
        >
          <div className="flex items-center gap-3">
            {teamHasScorecard && (
              <svg
                className={`w-4 h-4 text-fairway transition-transform duration-200 ${
                  isExpanded ? "rotate-90" : ""
                }`}
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2.5}
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
            )}
            <span className="font-medium text-scorecard-pencil font-sans">
              {team.name}
            </span>
            {team.isSub && (
              <span className="px-2 py-0.5 text-xs bg-warning-bg text-warning-text rounded font-display font-medium uppercase tracking-wider">
                Sub
              </span>
            )}
            {hasMismatch && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-warning-bg text-warning-text rounded font-sans font-medium" title={`Matchup gross (${team.gross}) differs from scorecard (${scorecardGross})`}>
                <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                Scorecard: {scorecardGross}
              </span>
            )}
          </div>
          <div className="flex items-center gap-6 text-sm">
            <div className="text-center">
              <div className="text-text-light text-xs font-display uppercase tracking-wider">Gross</div>
              <div className={`font-mono font-medium tabular-nums ${hasMismatch ? "text-warning-text" : ""}`}>{team.gross}</div>
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
              <div className="font-mono font-bold text-fairway text-lg tabular-nums">
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
                <svg
                  className="animate-spin h-5 w-5 text-fairway"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
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
                {renderTeamRow(matchup, matchup.teamA, matchup.teamAId, "A")}
                {renderTeamRow(matchup, matchup.teamB, matchup.teamBId, "B")}

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
