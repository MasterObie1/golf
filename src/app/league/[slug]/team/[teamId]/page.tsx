import Link from "next/link";
import { notFound } from "next/navigation";
import { getLeagueBySlug } from "@/lib/actions/leagues";
import { getTeamById, getCurrentWeekNumber } from "@/lib/actions/teams";
import { getTeamMatchupHistory } from "@/lib/actions/matchups";
import { getTeamWeeklyScores } from "@/lib/actions/weekly-scores";
import { getTeamSchedule } from "@/lib/actions/schedule";
import { ScoreCard } from "@/components/ScoreCard";
import { WeeklyScoreCard } from "@/components/WeeklyScoreCard";
import { ContourBackground } from "@/components/grounds/ContourBackground";
import { formatPosition } from "@/lib/format-utils";
import type { Metadata } from "next";

interface Props {
  params: Promise<{ slug: string; teamId: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, teamId } = await params;
  const teamIdNum = parseInt(teamId, 10);
  if (isNaN(teamIdNum)) return { title: "Team" };

  const [league, team] = await Promise.all([
    getLeagueBySlug(slug),
    getTeamById(teamIdNum),
  ]);
  if (!league || !team) return { title: "Team" };
  return {
    title: `${team.name} - ${league.name}`,
    description: `Match history and stats for ${team.name} in ${league.name}`,
  };
}

export default async function TeamHistoryPage({ params }: Props) {
  const { slug, teamId } = await params;
  const teamIdNum = parseInt(teamId, 10);

  if (isNaN(teamIdNum)) {
    notFound();
  }

  const league = await getLeagueBySlug(slug);
  if (!league) {
    notFound();
  }

  const team = await getTeamById(teamIdNum);
  if (!team || team.leagueId !== league.id) {
    notFound();
  }

  const scoringType = league.scoringType || "match_play";
  const isStrokePlay = scoringType === "stroke_play";
  const isHybrid = scoringType === "hybrid";
  const hasMatchPlay = scoringType === "match_play" || isHybrid;
  const hasStrokePlay = isStrokePlay || isHybrid;

  // Fetch data based on scoring type
  const [matchups, weeklyScores, teamSchedule, currentWeek] = await Promise.all([
    hasMatchPlay ? getTeamMatchupHistory(league.id, teamIdNum).then(r => r.matchups) : Promise.resolve([]),
    hasStrokePlay ? getTeamWeeklyScores(league.id, teamIdNum) : Promise.resolve([]),
    hasMatchPlay ? getTeamSchedule(league.id, teamIdNum) : Promise.resolve([]),
    getCurrentWeekNumber(league.id),
  ]);

  // Group matchups by week
  const matchupsByWeek = matchups.reduce(
    (acc, matchup) => {
      if (!acc[matchup.weekNumber]) {
        acc[matchup.weekNumber] = [];
      }
      acc[matchup.weekNumber].push({
        id: matchup.id,
        teamA: {
          name: matchup.teamA.name,
          gross: matchup.teamAGross,
          handicap: matchup.teamAHandicap,
          net: matchup.teamANet,
          points: matchup.teamAPoints,
          isSub: matchup.teamAIsSub,
        },
        teamB: {
          name: matchup.teamB.name,
          gross: matchup.teamBGross,
          handicap: matchup.teamBHandicap,
          net: matchup.teamBNet,
          points: matchup.teamBPoints,
          isSub: matchup.teamBIsSub,
        },
        isForfeit: matchup.isForfeit,
        forfeitTeamId: matchup.forfeitTeamId,
        teamAId: matchup.teamAId,
        teamBId: matchup.teamBId,
      });
      return acc;
    },
    {} as Record<number, {
      id: number;
      teamA: { name: string; gross: number; handicap: number; net: number; points: number; isSub: boolean };
      teamB: { name: string; gross: number; handicap: number; net: number; points: number; isSub: boolean };
      isForfeit: boolean;
      forfeitTeamId: number | null;
      teamAId: number;
      teamBId: number;
    }[]>
  );

  const matchupWeekNumbers = Object.keys(matchupsByWeek)
    .map(Number)
    .sort((a, b) => b - a);

  // Group weekly scores by week
  const scoresByWeek: Record<number, typeof weeklyScores> = {};
  for (const score of weeklyScores) {
    if (!scoresByWeek[score.weekNumber]) {
      scoresByWeek[score.weekNumber] = [];
    }
    scoresByWeek[score.weekNumber].push(score);
  }

  const scoreWeekNumbers = Object.keys(scoresByWeek)
    .map(Number)
    .sort((a, b) => b - a);

  // Calculate match play stats
  const matchPoints = matchups.reduce((sum, m) => {
    if (m.teamAId === teamIdNum) return sum + m.teamAPoints;
    return sum + m.teamBPoints;
  }, 0);

  // Calculate stroke play stats
  const playedScores = weeklyScores.filter((s) => !s.isDnp);
  const dnpCount = weeklyScores.filter((s) => s.isDnp).length;
  const strokeTotalPoints = weeklyScores.reduce((sum, s) => sum + s.points, 0);
  // Apply proRate if enabled (divide total points by rounds played, matching leaderboard)
  const strokeDisplayPoints = league.strokePlayProRate && playedScores.length > 0
    ? Math.round((strokeTotalPoints / playedScores.length) * 10) / 10
    : strokeTotalPoints;
  // Check if team is excluded by maxDnp (matching leaderboard logic)
  const excludedByDnp = league.strokePlayMaxDnp !== null && dnpCount > league.strokePlayMaxDnp;
  const avgNet = playedScores.length > 0
    ? Math.round((playedScores.reduce((sum, s) => sum + s.netScore, 0) / playedScores.length) * 10) / 10
    : 0;
  const bestFinish = playedScores.length > 0
    ? Math.min(...playedScores.map((s) => s.position))
    : 0;
  const avgPointsPerRound = playedScores.length > 0
    ? Math.round((strokeTotalPoints / playedScores.length) * 10) / 10
    : 0;

  return (
    <div className="min-h-screen bg-surface relative">
      <ContourBackground variant="hills" color="text-fairway" opacity="opacity-[0.04]" />

      <div className="relative max-w-4xl mx-auto px-4 py-8">
        <div className="mb-6">
          <Link
            href={`/league/${slug}/leaderboard`}
            className="text-fairway hover:text-rough font-display text-sm uppercase tracking-wider transition-colors"
          >
            &larr; Back to Leaderboard
          </Link>
        </div>

        <h1 className="text-3xl font-bold text-scorecard-pencil font-display uppercase tracking-wider mb-2">
          {team.name}
        </h1>
        <p className="text-text-secondary mb-4 font-sans">{league.name}</p>

        {/* Team Stats Summary */}
        <div className="bg-scorecard-paper rounded-lg shadow-md border border-scorecard-line/50 p-6 mb-8">
          {isStrokePlay ? (
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold text-fairway font-mono tabular-nums">{excludedByDnp ? 0 : strokeDisplayPoints}</div>
                <div className="text-sm text-text-muted font-sans">{league.strokePlayProRate ? "Pts/Rd" : "Total Points"}</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-text-primary font-mono tabular-nums">{playedScores.length}</div>
                <div className="text-sm text-text-muted font-sans">Rounds Played</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-water font-mono tabular-nums">{avgNet}</div>
                <div className="text-sm text-text-muted font-sans">Avg Net</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-wood font-mono tabular-nums">
                  {bestFinish > 0 ? formatPosition(bestFinish) : "\u2014"}
                </div>
                <div className="text-sm text-text-muted font-sans">Best Finish</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-text-secondary font-mono tabular-nums">{avgPointsPerRound}</div>
                <div className="text-sm text-text-muted font-sans">Avg Pts/Rd</div>
              </div>
            </div>
          ) : isHybrid ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold text-fairway font-mono tabular-nums">{excludedByDnp ? 0 : Math.round((matchPoints * (1 - (league.hybridFieldWeight ?? 0.5)) + strokeDisplayPoints * (league.hybridFieldWeight ?? 0.5)) * 10) / 10}</div>
                <div className="text-sm text-text-muted font-sans">Combined Points</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-fairway font-mono tabular-nums">{team.wins}</div>
                <div className="text-sm text-text-muted font-sans">Match Wins</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-water font-mono tabular-nums">{avgNet}</div>
                <div className="text-sm text-text-muted font-sans">Avg Net</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-wood font-mono tabular-nums">
                  {bestFinish > 0 ? formatPosition(bestFinish) : "\u2014"}
                </div>
                <div className="text-sm text-text-muted font-sans">Best Finish</div>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold text-fairway font-mono tabular-nums">{matchPoints}</div>
                <div className="text-sm text-text-muted font-sans">Total Points</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-fairway font-mono tabular-nums">{team.wins}</div>
                <div className="text-sm text-text-muted font-sans">Wins</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-board-red font-mono tabular-nums">{team.losses}</div>
                <div className="text-sm text-text-muted font-sans">Losses</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-text-secondary font-mono tabular-nums">{team.ties}</div>
                <div className="text-sm text-text-muted font-sans">Ties</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-text-primary font-mono tabular-nums">{matchups.length}</div>
                <div className="text-sm text-text-muted font-sans">Matches</div>
              </div>
            </div>
          )}
        </div>

        {/* Match Play History */}
        {hasMatchPlay && (
          <>
            <h2 className="text-xl font-semibold text-scorecard-pencil font-display uppercase tracking-wider mb-4">
              Match History
            </h2>

            {matchups.length === 0 ? (
              <div className="bg-scorecard-paper rounded-lg shadow-md border border-scorecard-line/50 p-8 text-center mb-8">
                <p className="text-text-muted font-sans">No matches have been played yet.</p>
              </div>
            ) : (
              <div className="space-y-2 mb-8">
                {matchupWeekNumbers.map((weekNumber) => (
                  <ScoreCard
                    key={weekNumber}
                    weekNumber={weekNumber}
                    matchups={matchupsByWeek[weekNumber]}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {/* Stroke Play History */}
        {hasStrokePlay && (
          <>
            <h2 className="text-xl font-semibold text-scorecard-pencil font-display uppercase tracking-wider mb-4">
              {isHybrid ? "Weekly Score History" : "Score History"}
            </h2>

            {weeklyScores.length === 0 ? (
              <div className="bg-scorecard-paper rounded-lg shadow-md border border-scorecard-line/50 p-8 text-center">
                <p className="text-text-muted font-sans">No scores have been recorded yet.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {scoreWeekNumbers.map((weekNumber) => (
                  <WeeklyScoreCard
                    key={weekNumber}
                    weekNumber={weekNumber}
                    scores={scoresByWeek[weekNumber]}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {/* Team Schedule */}
        {teamSchedule.length > 0 && (
          <>
            <h2 className="text-xl font-semibold text-scorecard-pencil font-display uppercase tracking-wider mb-4 mt-8">
              Upcoming Schedule
            </h2>
            <div className="bg-scorecard-paper rounded-lg shadow-md border border-scorecard-line/50 overflow-hidden">
              <div className="divide-y divide-scorecard-line/40">
                {teamSchedule
                  .filter((w) => w.weekNumber >= currentWeek)
                  .slice(0, 8)
                  .map((week) => {
                    const match = week.matches[0];
                    if (!match) return null;
                    const isBye = !match.teamB;
                    const opponent = match.teamA.id === teamIdNum
                      ? match.teamB
                      : match.teamA;

                    return (
                      <div key={week.weekNumber} className={`px-4 py-3 flex items-center justify-between ${
                        week.weekNumber === currentWeek ? "bg-putting/10" : ""
                      }`}>
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-medium text-text-muted w-16 font-mono tabular-nums">
                            Wk {week.weekNumber}
                            {week.weekNumber === currentWeek && (
                              <span className="ml-1 text-fairway text-xs">*</span>
                            )}
                          </span>
                          {isBye ? (
                            <span className="text-text-light font-sans">BYE</span>
                          ) : opponent ? (
                            <Link
                              href={`/league/${slug}/team/${opponent.id}`}
                              className="text-fairway hover:text-rough font-medium font-sans transition-colors"
                            >
                              vs {opponent.name}
                            </Link>
                          ) : null}
                        </div>
                        <span className="text-xs text-text-light font-sans">
                          {match.status === "completed" ? "Completed" : "Scheduled"}
                        </span>
                      </div>
                    );
                  })}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
