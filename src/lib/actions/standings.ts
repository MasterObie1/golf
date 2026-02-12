"use server";

import { prisma } from "../db";

// Safe select clause for team queries in public-facing standings/leaderboard responses.
// Excludes PII fields (captainName, email, phone) that should never appear in public responses.
const safeTeamSelect = {
  id: true,
  name: true,
  totalPoints: true,
  wins: true,
  losses: true,
  ties: true,
  status: true,
  seasonId: true,
  leagueId: true,
} as const;

// --- Types ---

type TeamWithStats = {
  id: number;
  name: string;
  totalPoints: number;
  wins: number;
  losses: number;
  ties: number;
  [key: string]: unknown;
};

type MatchupForRanking = {
  teamAId: number;
  teamBId: number;
  teamAPoints: number;
  teamBPoints: number;
  teamANet: number;
  teamBNet: number;
  teamAHandicap: number;
  teamBHandicap: number;
  teamAIsSub: boolean;
  teamBIsSub: boolean;
};

type WeeklyScoreForRanking = {
  teamId: number;
  weekNumber: number;
  netScore: number;
  grossScore: number;
  handicap: number;
  points: number;
  position: number;
  isDnp: boolean;
  isSub: boolean;
};

// --- Helpers ---

function averageHandicap(handicapValues: number[], fallback: number): number {
  return handicapValues.length > 0
    ? Math.floor(handicapValues.reduce((sum, h) => sum + h, 0) / handicapValues.length)
    : fallback;
}

function buildHeadToHead(
  teams: { id: number }[],
  matchups: { teamAId: number; teamBId: number; teamAPoints: number; teamBPoints: number }[]
): Record<number, Record<number, number>> {
  const h2h: Record<number, Record<number, number>> = {};
  for (const team of teams) h2h[team.id] = {};
  for (const m of matchups) {
    if (h2h[m.teamAId]) h2h[m.teamAId][m.teamBId] = (h2h[m.teamAId][m.teamBId] || 0) + m.teamAPoints;
    if (h2h[m.teamBId]) h2h[m.teamBId][m.teamAId] = (h2h[m.teamBId][m.teamAId] || 0) + m.teamBPoints;
  }
  return h2h;
}

// --- Match Play Ranking (existing) ---

function rankTeams<T extends TeamWithStats>(teams: T[], matchups: MatchupForRanking[]) {
  const handicaps: Record<number, number> = {};
  for (const team of teams) {
    const teamHandicaps: number[] = [];
    for (const m of matchups) {
      if (m.teamAId === team.id && !m.teamAIsSub) {
        teamHandicaps.push(m.teamAHandicap);
      } else if (m.teamBId === team.id && !m.teamBIsSub) {
        teamHandicaps.push(m.teamBHandicap);
      }
    }

    handicaps[team.id] = averageHandicap(teamHandicaps, 0);
  }

  const netDifferential: Record<number, number> = {};
  for (const team of teams) {
    netDifferential[team.id] = 0;
  }

  for (const m of matchups) {
    if (netDifferential[m.teamAId] !== undefined) {
      netDifferential[m.teamAId] += m.teamBNet - m.teamANet;
    }
    if (netDifferential[m.teamBId] !== undefined) {
      netDifferential[m.teamBId] += m.teamANet - m.teamBNet;
    }
  }

  const headToHead = buildHeadToHead(teams, matchups);

  const sortedTeams = [...teams].sort((a, b) => {
    if (a.totalPoints !== b.totalPoints) return b.totalPoints - a.totalPoints;
    if (a.wins !== b.wins) return b.wins - a.wins;

    const aVsB = headToHead[a.id]?.[b.id] || 0;
    const bVsA = headToHead[b.id]?.[a.id] || 0;
    if (aVsB !== 0 || bVsA !== 0) {
      if (aVsB !== bVsA) return bVsA - aVsB;
    }

    const aDiff = netDifferential[a.id] || 0;
    const bDiff = netDifferential[b.id] || 0;
    return bDiff - aDiff;
  });

  return sortedTeams.map((team) => ({
    ...team,
    handicap: handicaps[team.id],
  }));
}

// --- Stroke Play Ranking ---

interface StrokePlayTeamStats {
  totalPoints: number;
  roundsPlayed: number;
  avgNet: number;
  bestFinish: number;
  handicap: number;
  positionCounts: Map<number, number>;
}

function buildStrokePlayStats(
  teams: { id: number }[],
  weeklyScores: WeeklyScoreForRanking[],
  config: { proRate: boolean; maxDnp: number | null }
) {
  const statsMap = new Map<number, StrokePlayTeamStats>();
  for (const team of teams) {
    const teamScores = weeklyScores.filter((s) => s.teamId === team.id);
    const playedScores = teamScores.filter((s) => !s.isDnp);
    const dnpCount = teamScores.filter((s) => s.isDnp).length;

    const positionCounts = new Map<number, number>();
    let totalNetScore = 0;
    let bestFinish = Infinity;
    const handicaps: number[] = [];

    for (const s of playedScores) {
      positionCounts.set(s.position, (positionCounts.get(s.position) || 0) + 1);
      totalNetScore += s.netScore;
      if (s.position < bestFinish) bestFinish = s.position;
      if (!s.isSub) handicaps.push(s.handicap);
    }

    const roundsPlayed = playedScores.length;
    const avgNet = roundsPlayed > 0 ? totalNetScore / roundsPlayed : 0;
    const avgHandicap = averageHandicap(handicaps, 0);

    // Sum points from individual weekly scores
    const rawPoints = teamScores.reduce((sum, s) => sum + s.points, 0);
    const totalPoints = config.proRate && roundsPlayed > 0
      ? rawPoints / roundsPlayed
      : rawPoints;

    // Check max DNP exclusion
    const excluded = config.maxDnp !== null && dnpCount > config.maxDnp;

    statsMap.set(team.id, {
      totalPoints: excluded ? -Infinity : totalPoints,
      roundsPlayed,
      avgNet,
      bestFinish: bestFinish === Infinity ? 0 : bestFinish,
      handicap: avgHandicap,
      positionCounts,
    });
  }

  return statsMap;
}

/**
 * Counting method tiebreaker: compare teams by most 1st-place finishes,
 * then most 2nd-place, etc.
 */
function compareCountingMethod(a: Map<number, number>, b: Map<number, number>): number {
  const maxPos = Math.max(
    ...[...a.keys(), ...b.keys()],
    0
  );
  for (let pos = 1; pos <= maxPos; pos++) {
    const aCount = a.get(pos) || 0;
    const bCount = b.get(pos) || 0;
    if (aCount !== bCount) return bCount - aCount; // more is better
  }
  return 0;
}

function rankTeamsStrokePlay<T extends { id: number; name: string }>(
  teams: T[],
  weeklyScores: WeeklyScoreForRanking[],
  config: { proRate: boolean; maxDnp: number | null }
) {
  const statsMap = buildStrokePlayStats(teams, weeklyScores, config);

  const sortedTeams = [...teams].sort((a, b) => {
    const aStats = statsMap.get(a.id)!;
    const bStats = statsMap.get(b.id)!;

    // Guard against NaN from -Infinity - (-Infinity) when both teams are excluded
    if (!isFinite(bStats.totalPoints) && !isFinite(aStats.totalPoints)) return 0;
    if (!isFinite(bStats.totalPoints)) return -1; // a ranks higher
    if (!isFinite(aStats.totalPoints)) return 1;  // b ranks higher

    // 1. Points desc
    if (aStats.totalPoints !== bStats.totalPoints) return bStats.totalPoints - aStats.totalPoints;
    // 2. Counting method
    const countingResult = compareCountingMethod(aStats.positionCounts, bStats.positionCounts);
    if (countingResult !== 0) return countingResult;
    // 3. Avg net asc (lower is better)
    if (aStats.avgNet !== bStats.avgNet) return aStats.avgNet - bStats.avgNet;
    // 4. Best single week asc (lower position = better)
    return aStats.bestFinish - bStats.bestFinish;
  });

  return sortedTeams.map((team) => {
    const stats = statsMap.get(team.id)!;
    return {
      ...team,
      // When totalPoints is -Infinity the team was excluded via maxDnp; 0 is used as a display placeholder
      totalPoints: stats.totalPoints === -Infinity ? 0 : stats.totalPoints,
      handicap: stats.handicap,
      roundsPlayed: stats.roundsPlayed,
      avgNet: Math.round(stats.avgNet * 10) / 10,
      bestFinish: stats.bestFinish,
      wins: 0,
      losses: 0,
      ties: 0,
    };
  });
}

// --- Hybrid Ranking ---

function rankTeamsHybrid<T extends TeamWithStats>(
  teams: T[],
  matchups: MatchupForRanking[],
  weeklyScores: WeeklyScoreForRanking[],
  fieldWeight: number,
  config: { proRate: boolean; maxDnp: number | null }
) {
  const clampedWeight = Math.max(0, Math.min(1, fieldWeight));

  // Get match play ranking data
  const matchHandicaps: Record<number, number[]> = {};
  for (const team of teams) {
    matchHandicaps[team.id] = [];
    for (const m of matchups) {
      if (m.teamAId === team.id && !m.teamAIsSub) matchHandicaps[team.id].push(m.teamAHandicap);
      else if (m.teamBId === team.id && !m.teamBIsSub) matchHandicaps[team.id].push(m.teamBHandicap);
    }
  }

  const strokeStats = buildStrokePlayStats(teams, weeklyScores, config);

  // Calculate match-play points from matchup records (not Team.totalPoints which includes stroke play)
  const matchPointsMap: Record<number, number> = {};
  for (const team of teams) {
    matchPointsMap[team.id] = 0;
  }
  for (const m of matchups) {
    if (matchPointsMap[m.teamAId] !== undefined) {
      matchPointsMap[m.teamAId] += m.teamAPoints;
    }
    if (matchPointsMap[m.teamBId] !== undefined) {
      matchPointsMap[m.teamBId] += m.teamBPoints;
    }
  }

  // Build head-to-head record from matchups
  const headToHead = buildHeadToHead(teams, matchups);

  // Calculate combined points using match-play points from matchups and field points from weekly scores
  const sortedTeams = [...teams].sort((a, b) => {
    const aStroke = strokeStats.get(a.id)!;
    const bStroke = strokeStats.get(b.id)!;

    const aMatchPoints = matchPointsMap[a.id] ?? 0;
    const bMatchPoints = matchPointsMap[b.id] ?? 0;
    // When totalPoints is -Infinity the team was excluded via maxDnp; 0 is used so it contributes nothing to the weighted sum
    const aFieldPoints = aStroke.totalPoints === -Infinity ? 0 : aStroke.totalPoints;
    const bFieldPoints = bStroke.totalPoints === -Infinity ? 0 : bStroke.totalPoints;

    // Note: If proRate is enabled, fieldPoints is already divided by roundsPlayed.
    // This means the hybrid formula mixes absolute match points with per-round field points.
    // This is intentional: it normalizes field performance across teams with different round counts.
    const aFinal = aMatchPoints * (1 - clampedWeight) + aFieldPoints * clampedWeight;
    const bFinal = bMatchPoints * (1 - clampedWeight) + bFieldPoints * clampedWeight;

    // Use epsilon to avoid floating-point rounding treating microscopically different sums as different ranks
    const RANK_EPSILON = 0.001;
    if (Math.abs(aFinal - bFinal) > RANK_EPSILON) return bFinal - aFinal;
    // Tiebreaker: W/L
    if (a.wins !== b.wins) return b.wins - a.wins;
    // Tiebreaker: head-to-head record
    const aVsB = headToHead[a.id]?.[b.id] || 0;
    const bVsA = headToHead[b.id]?.[a.id] || 0;
    if (aVsB !== 0 || bVsA !== 0) {
      if (aVsB !== bVsA) return bVsA - aVsB;
    }
    // Tiebreaker: counting method
    const countingResult = compareCountingMethod(aStroke.positionCounts, bStroke.positionCounts);
    if (countingResult !== 0) return countingResult;
    // Tiebreaker: avg net
    return aStroke.avgNet - bStroke.avgNet;
  });

  return sortedTeams.map((team) => {
    const stroke = strokeStats.get(team.id)!;
    // When totalPoints is -Infinity the team was excluded via maxDnp; fieldPoints = 0 signals exclusion (no separate flag in return type)
    const fieldPoints = stroke.totalPoints === -Infinity ? 0 : stroke.totalPoints;
    const matchPoints = matchPointsMap[team.id] ?? 0;
    const handicapValues = matchHandicaps[team.id];
    const avgHandicap = averageHandicap(handicapValues, stroke.handicap);

    return {
      ...team,
      totalPoints: Math.round((matchPoints * (1 - clampedWeight) + fieldPoints * clampedWeight) * 10) / 10,
      matchPoints,
      fieldPoints: Math.round(fieldPoints * 10) / 10,
      handicap: avgHandicap,
      roundsPlayed: stroke.roundsPlayed,
      avgNet: Math.round(stroke.avgNet * 10) / 10,
      bestFinish: stroke.bestFinish,
    };
  });
}

// --- Standings at Week (for movement tracking) ---

function calculateStandingsAtWeek(
  teams: { id: number; name: string }[],
  matchups: (MatchupForRanking & { weekNumber: number })[],
  upToWeek: number
) {
  const filteredMatchups = matchups.filter((m) => m.weekNumber <= upToWeek);

  const stats: Record<number, { points: number; wins: number; losses: number; ties: number }> = {};
  const handicaps: Record<number, number[]> = {};
  const netDifferential: Record<number, number> = {};

  for (const team of teams) {
    stats[team.id] = { points: 0, wins: 0, losses: 0, ties: 0 };
    handicaps[team.id] = [];
    netDifferential[team.id] = 0;
  }

  for (const m of filteredMatchups) {
    if (stats[m.teamAId]) stats[m.teamAId].points += m.teamAPoints;
    if (stats[m.teamBId]) stats[m.teamBId].points += m.teamBPoints;

    if (m.teamAPoints > m.teamBPoints) {
      if (stats[m.teamAId]) stats[m.teamAId].wins += 1;
      if (stats[m.teamBId]) stats[m.teamBId].losses += 1;
    } else if (m.teamBPoints > m.teamAPoints) {
      if (stats[m.teamBId]) stats[m.teamBId].wins += 1;
      if (stats[m.teamAId]) stats[m.teamAId].losses += 1;
    } else {
      if (stats[m.teamAId]) stats[m.teamAId].ties += 1;
      if (stats[m.teamBId]) stats[m.teamBId].ties += 1;
    }

    if (!m.teamAIsSub && handicaps[m.teamAId]) handicaps[m.teamAId].push(m.teamAHandicap);
    if (!m.teamBIsSub && handicaps[m.teamBId]) handicaps[m.teamBId].push(m.teamBHandicap);

    if (netDifferential[m.teamAId] !== undefined) netDifferential[m.teamAId] += m.teamBNet - m.teamANet;
    if (netDifferential[m.teamBId] !== undefined) netDifferential[m.teamBId] += m.teamANet - m.teamBNet;
  }

  const headToHead = buildHeadToHead(teams, filteredMatchups);

  const avgHandicaps: Record<number, number> = {};
  for (const team of teams) {
    const hcps = handicaps[team.id];
    avgHandicaps[team.id] = averageHandicap(hcps, 0);
  }

  const sortedTeams = [...teams].sort((a, b) => {
    const aStats = stats[a.id] || { points: 0, wins: 0 };
    const bStats = stats[b.id] || { points: 0, wins: 0 };

    if (aStats.points !== bStats.points) return bStats.points - aStats.points;
    if (aStats.wins !== bStats.wins) return bStats.wins - aStats.wins;

    const aVsB = headToHead[a.id]?.[b.id] || 0;
    const bVsA = headToHead[b.id]?.[a.id] || 0;
    if (aVsB !== 0 || bVsA !== 0) {
      if (aVsB !== bVsA) return bVsA - aVsB;
    }

    return (netDifferential[b.id] || 0) - (netDifferential[a.id] || 0);
  });

  const ranked = sortedTeams.map((team) => ({
    teamId: team.id,
    teamName: team.name,
    rank: 0,
    handicap: avgHandicaps[team.id],
    ...stats[team.id],
  }));

  // Dense ranking: teams with the same points share the same rank
  let currentRank = 1;
  for (let i = 0; i < ranked.length; i++) {
    if (i > 0 && ranked[i].points === ranked[i - 1].points) {
      ranked[i].rank = ranked[i - 1].rank;
    } else {
      ranked[i].rank = currentRank;
    }
    currentRank = i + 2;
  }

  return ranked;
}

function calculateStandingsAtWeekStrokePlay(
  teams: { id: number; name: string }[],
  weeklyScores: WeeklyScoreForRanking[],
  upToWeek: number,
  config: { proRate: boolean; maxDnp: number | null }
) {
  const filteredScores = weeklyScores.filter((s) => s.weekNumber <= upToWeek);
  const statsMap = buildStrokePlayStats(teams, filteredScores, config);

  const sortedTeams = [...teams].sort((a, b) => {
    const aStats = statsMap.get(a.id)!;
    const bStats = statsMap.get(b.id)!;

    // Guard against NaN from -Infinity - (-Infinity) when both teams are excluded
    if (!isFinite(bStats.totalPoints) && !isFinite(aStats.totalPoints)) return 0;
    if (!isFinite(bStats.totalPoints)) return -1; // a ranks higher
    if (!isFinite(aStats.totalPoints)) return 1;  // b ranks higher

    if (aStats.totalPoints !== bStats.totalPoints) return bStats.totalPoints - aStats.totalPoints;
    const countingResult = compareCountingMethod(aStats.positionCounts, bStats.positionCounts);
    if (countingResult !== 0) return countingResult;
    if (aStats.avgNet !== bStats.avgNet) return aStats.avgNet - bStats.avgNet;
    return aStats.bestFinish - bStats.bestFinish;
  });

  const ranked = sortedTeams.map((team) => {
    const stats = statsMap.get(team.id)!;
    return {
      teamId: team.id,
      teamName: team.name,
      rank: 0,
      handicap: stats.handicap,
      // When totalPoints is -Infinity the team was excluded via maxDnp; 0 is used as a display placeholder
      points: stats.totalPoints === -Infinity ? 0 : stats.totalPoints,
      roundsPlayed: stats.roundsPlayed,
      avgNet: Math.round(stats.avgNet * 10) / 10,
      bestFinish: stats.bestFinish,
    };
  });

  // Dense ranking: teams with the same totalPoints share the same rank
  let currentRank = 1;
  for (let i = 0; i < ranked.length; i++) {
    const thisPoints = statsMap.get(sortedTeams[i].id)!.totalPoints;
    const prevPoints = i > 0 ? statsMap.get(sortedTeams[i - 1].id)!.totalPoints : null;
    if (i > 0 && thisPoints === prevPoints) {
      ranked[i].rank = ranked[i - 1].rank;
    } else {
      ranked[i].rank = currentRank;
    }
    currentRank = i + 2;
  }

  return ranked;
}

// --- Public API ---

// Public read — no auth required. Called from public leaderboard/history pages.
export async function getLeaderboard(leagueId: number) {
  const teams = await prisma.team.findMany({
    where: { leagueId, status: "approved" },
    select: safeTeamSelect,
  });

  const matchups = await prisma.matchup.findMany({
    where: { leagueId },
  });

  return rankTeams(teams, matchups);
}

export interface LeaderboardWithMovement {
  id: number;
  name: string;
  totalPoints: number;
  wins: number;
  losses: number;
  ties: number;
  handicap: number;
  rankChange: number | null;
  handicapChange: number | null;
  previousRank: number | null;
  previousHandicap: number | null;
  // Stroke play fields
  avgNet?: number;
  bestFinish?: number;
  roundsPlayed?: number;
  // Hybrid fields
  matchPoints?: number;
  fieldPoints?: number;
}

// Public read — no auth required. Called from public leaderboard/history pages.
export async function getLeaderboardWithMovement(leagueId: number): Promise<LeaderboardWithMovement[]> {
  const league = await prisma.league.findUniqueOrThrow({
    where: { id: leagueId },
    select: { scoringType: true, strokePlayProRate: true, strokePlayMaxDnp: true, hybridFieldWeight: true },
  });

  const teams = await prisma.team.findMany({
    where: { leagueId, status: "approved" },
    select: safeTeamSelect,
  });

  if (league.scoringType === "stroke_play") {
    return getStrokePlayMovement(teams, leagueId, {
      proRate: league.strokePlayProRate,
      maxDnp: league.strokePlayMaxDnp,
    });
  }

  if (league.scoringType === "hybrid") {
    return getHybridMovement(teams, leagueId, league.hybridFieldWeight, {
      proRate: league.strokePlayProRate,
      maxDnp: league.strokePlayMaxDnp,
    });
  }

  // Match play (existing logic)
  return getMatchPlayMovement(teams, leagueId);
}

async function getMatchPlayMovement(
  teams: TeamWithStats[],
  leagueId: number
): Promise<LeaderboardWithMovement[]> {
  const matchups = await prisma.matchup.findMany({
    where: { leagueId },
  });

  if (matchups.length === 0) {
    return teams.map((team) => ({
      id: team.id,
      name: team.name,
      totalPoints: team.totalPoints,
      wins: team.wins,
      losses: team.losses,
      ties: team.ties,
      // No matchup data to derive handicap from; Team model has no handicap field.
      // Return 0 because LeaderboardWithMovement.handicap is typed as number.
      handicap: 0,
      rankChange: null,
      handicapChange: null,
      previousRank: null,
      previousHandicap: null,
    }));
  }

  const weekNumbers = [...new Set(matchups.map((m) => m.weekNumber))].sort((a, b) => b - a);
  const currentWeek = weekNumbers[0];
  const previousWeek = weekNumbers.length > 1 ? weekNumbers[1] : null;

  const currentStandings = calculateStandingsAtWeek(
    teams.map((t) => ({ id: t.id, name: t.name })),
    matchups,
    currentWeek
  );

  let previousStandings: ReturnType<typeof calculateStandingsAtWeek> | null = null;
  if (previousWeek !== null) {
    previousStandings = calculateStandingsAtWeek(
      teams.map((t) => ({ id: t.id, name: t.name })),
      matchups,
      previousWeek
    );
  }

  const previousData: Record<number, { rank: number; handicap: number }> = {};
  if (previousStandings) {
    for (const standing of previousStandings) {
      previousData[standing.teamId] = { rank: standing.rank, handicap: standing.handicap };
    }
  }

  return currentStandings.map((standing) => {
    const prev = previousData[standing.teamId];
    const team = teams.find((t) => t.id === standing.teamId)!;

    const playedPreviousWeek = previousWeek !== null && matchups.some(
      (m) => m.weekNumber === previousWeek && (m.teamAId === standing.teamId || m.teamBId === standing.teamId)
    );

    let rankChange: number | null = null;
    let handicapChange: number | null = null;

    if (prev && playedPreviousWeek) {
      rankChange = prev.rank - standing.rank;
      handicapChange = standing.handicap - prev.handicap;
    }

    return {
      id: team.id,
      name: team.name,
      totalPoints: standing.points,
      wins: standing.wins,
      losses: standing.losses,
      ties: standing.ties,
      handicap: standing.handicap,
      rankChange,
      handicapChange,
      previousRank: prev?.rank ?? null,
      previousHandicap: prev?.handicap ?? null,
    };
  });
}

async function getStrokePlayMovement(
  teams: { id: number; name: string; totalPoints: number; wins: number; losses: number; ties: number }[],
  leagueId: number,
  config: { proRate: boolean; maxDnp: number | null }
): Promise<LeaderboardWithMovement[]> {
  const weeklyScores = await prisma.weeklyScore.findMany({
    where: { leagueId },
    select: {
      teamId: true, weekNumber: true, netScore: true, grossScore: true,
      handicap: true, points: true, position: true, isDnp: true, isSub: true,
    },
  });

  if (weeklyScores.length === 0) {
    return teams.map((team) => ({
      id: team.id,
      name: team.name,
      totalPoints: team.totalPoints,
      wins: 0, losses: 0, ties: 0,
      // No weekly score data to derive handicap from; Team model has no handicap field.
      // Return 0 because LeaderboardWithMovement.handicap is typed as number.
      handicap: 0,
      rankChange: null, handicapChange: null,
      previousRank: null, previousHandicap: null,
      avgNet: 0, bestFinish: 0, roundsPlayed: 0,
    }));
  }

  const weekNumbers = [...new Set(weeklyScores.map((s) => s.weekNumber))].sort((a, b) => b - a);
  const currentWeek = weekNumbers[0];
  const previousWeek = weekNumbers.length > 1 ? weekNumbers[1] : null;

  const currentStandings = calculateStandingsAtWeekStrokePlay(
    teams.map((t) => ({ id: t.id, name: t.name })),
    weeklyScores,
    currentWeek,
    config
  );

  let previousStandings: ReturnType<typeof calculateStandingsAtWeekStrokePlay> | null = null;
  if (previousWeek !== null) {
    previousStandings = calculateStandingsAtWeekStrokePlay(
      teams.map((t) => ({ id: t.id, name: t.name })),
      weeklyScores,
      previousWeek,
      config
    );
  }

  const previousData: Record<number, { rank: number; handicap: number }> = {};
  if (previousStandings) {
    for (const standing of previousStandings) {
      previousData[standing.teamId] = { rank: standing.rank, handicap: standing.handicap };
    }
  }

  return currentStandings.map((standing) => {
    const prev = previousData[standing.teamId];
    const team = teams.find((t) => t.id === standing.teamId)!;

    const playedPreviousWeek = previousWeek !== null && weeklyScores.some(
      (s) => s.weekNumber === previousWeek && s.teamId === standing.teamId && !s.isDnp
    );

    let rankChange: number | null = null;
    let handicapChange: number | null = null;

    if (prev && playedPreviousWeek) {
      rankChange = prev.rank - standing.rank;
      handicapChange = standing.handicap - prev.handicap;
    }

    return {
      id: team.id,
      name: team.name,
      totalPoints: standing.points,
      wins: 0, losses: 0, ties: 0,
      handicap: standing.handicap,
      rankChange,
      handicapChange,
      previousRank: prev?.rank ?? null,
      previousHandicap: prev?.handicap ?? null,
      avgNet: standing.avgNet,
      bestFinish: standing.bestFinish,
      roundsPlayed: standing.roundsPlayed,
    };
  });
}

async function getHybridMovement(
  teams: TeamWithStats[],
  leagueId: number,
  fieldWeight: number,
  config: { proRate: boolean; maxDnp: number | null }
): Promise<LeaderboardWithMovement[]> {
  const [matchups, weeklyScores] = await Promise.all([
    prisma.matchup.findMany({ where: { leagueId } }),
    prisma.weeklyScore.findMany({
      where: { leagueId },
      select: {
        teamId: true, weekNumber: true, netScore: true, grossScore: true,
        handicap: true, points: true, position: true, isDnp: true, isSub: true,
      },
    }),
  ]);

  const ranked = rankTeamsHybrid(teams, matchups, weeklyScores, fieldWeight, config);

  // Determine current and previous weeks from both data sources
  const matchWeeks = [...new Set(matchups.map((m) => m.weekNumber))];
  const scoreWeeks = [...new Set(weeklyScores.map((s) => s.weekNumber))];
  const allWeeks = [...new Set([...matchWeeks, ...scoreWeeks])].sort((a, b) => b - a);
  const currentWeek = allWeeks[0] ?? null;
  const previousWeek = allWeeks.length > 1 ? allWeeks[1] : null;

  // Calculate previous week rankings for movement
  let previousRanks: Map<number, { rank: number; handicap: number }> | null = null;
  if (previousWeek !== null) {
    const prevMatchups = matchups.filter((m) => m.weekNumber <= previousWeek);
    const prevScores = weeklyScores.filter((s) => s.weekNumber <= previousWeek);
    const prevRanked = rankTeamsHybrid(teams, prevMatchups, prevScores, fieldWeight, config);
    // Build previous ranks with dense ranking (shared ranks for ties)
    previousRanks = new Map<number, { rank: number; handicap: number }>();
    let prevCurrentRank = 1;
    for (let i = 0; i < prevRanked.length; i++) {
      let rank: number;
      if (i > 0 && prevRanked[i].totalPoints === prevRanked[i - 1].totalPoints) {
        rank = previousRanks.get(prevRanked[i - 1].id)!.rank;
      } else {
        rank = prevCurrentRank;
      }
      previousRanks.set(prevRanked[i].id, { rank, handicap: prevRanked[i].handicap });
      prevCurrentRank = i + 2;
    }
  }

  // Build current ranks with dense ranking (shared ranks for ties)
  const currentRanks: number[] = [];
  let curRank = 1;
  for (let i = 0; i < ranked.length; i++) {
    if (i > 0 && ranked[i].totalPoints === ranked[i - 1].totalPoints) {
      currentRanks.push(currentRanks[i - 1]);
    } else {
      currentRanks.push(curRank);
    }
    curRank = i + 2;
  }

  return ranked.map((team, index) => {
    const currentRank = currentRanks[index];
    const prev = previousRanks?.get(team.id);

    let rankChange: number | null = null;
    let handicapChange: number | null = null;

    if (prev && currentWeek !== null) {
      // Check if team had activity in previous week
      const hadPrevActivity = matchups.some(
        (m) => m.weekNumber === previousWeek && (m.teamAId === team.id || m.teamBId === team.id)
      ) || weeklyScores.some(
        (s) => s.weekNumber === previousWeek && s.teamId === team.id && !s.isDnp
      );
      if (hadPrevActivity) {
        rankChange = prev.rank - currentRank;
        handicapChange = team.handicap - prev.handicap;
      }
    }

    return {
      id: team.id,
      name: team.name,
      totalPoints: team.totalPoints,
      wins: team.wins,
      losses: team.losses,
      ties: team.ties,
      handicap: team.handicap,
      rankChange,
      handicapChange,
      previousRank: prev?.rank ?? null,
      previousHandicap: prev?.handicap ?? null,
      matchPoints: team.matchPoints,
      fieldPoints: team.fieldPoints,
      avgNet: team.avgNet,
      bestFinish: team.bestFinish,
      roundsPlayed: team.roundsPlayed,
    };
  });
}

// Public read — no auth required. Called from public leaderboard/history pages.
export async function getSeasonLeaderboard(seasonId: number) {
  // Get league config from the season
  const season = await prisma.season.findUniqueOrThrow({
    where: { id: seasonId },
    select: { leagueId: true, scoringType: true },
  });

  const league = await prisma.league.findUniqueOrThrow({
    where: { id: season.leagueId },
    select: {
      scoringType: true,
      strokePlayProRate: true,
      strokePlayMaxDnp: true,
      hybridFieldWeight: true,
    },
  });

  // Use season's scoringType for historical accuracy, fall back to league's
  const scoringType = season.scoringType || league.scoringType;

  const teams = await prisma.team.findMany({
    where: { seasonId, status: "approved" },
    select: safeTeamSelect,
  });

  if (scoringType === "stroke_play") {
    const weeklyScores = await prisma.weeklyScore.findMany({
      where: { seasonId },
      select: {
        teamId: true, weekNumber: true, netScore: true, grossScore: true,
        handicap: true, points: true, position: true, isDnp: true, isSub: true,
      },
    });
    return rankTeamsStrokePlay(teams, weeklyScores, {
      proRate: league.strokePlayProRate,
      maxDnp: league.strokePlayMaxDnp,
    });
  }

  if (scoringType === "hybrid") {
    const [matchups, weeklyScores] = await Promise.all([
      prisma.matchup.findMany({ where: { seasonId } }),
      prisma.weeklyScore.findMany({
        where: { seasonId },
        select: {
          teamId: true, weekNumber: true, netScore: true, grossScore: true,
          handicap: true, points: true, position: true, isDnp: true, isSub: true,
        },
      }),
    ]);
    return rankTeamsHybrid(teams, matchups, weeklyScores, league.hybridFieldWeight, {
      proRate: league.strokePlayProRate,
      maxDnp: league.strokePlayMaxDnp,
    });
  }

  // Match play (default)
  const matchups = await prisma.matchup.findMany({
    where: { seasonId },
  });
  return rankTeams(teams, matchups);
}

// Public read — no auth required. Called from public leaderboard/history pages.
export async function getAllTimeLeaderboard(leagueId: number) {
  const league = await prisma.league.findUniqueOrThrow({
    where: { id: leagueId },
    select: { scoringType: true },
  });

  const teams = await prisma.team.findMany({
    where: { leagueId, status: "approved" },
    select: safeTeamSelect,
  });

  if (league.scoringType === "stroke_play") {
    // Aggregate stroke play stats by team name across seasons
    const weeklyScores = await prisma.weeklyScore.findMany({
      where: { leagueId },
      select: { teamId: true, points: true, netScore: true, isDnp: true, position: true },
    });

    const scoresByTeamId = new Map<number, typeof weeklyScores>();
    for (const s of weeklyScores) {
      const arr = scoresByTeamId.get(s.teamId) || [];
      arr.push(s);
      scoresByTeamId.set(s.teamId, arr);
    }

    const teamStats: Record<string, {
      name: string;
      totalPoints: number;
      roundsPlayed: number;
      netSum: number;
      avgNet: number;
      bestFinish: number;
      matchCount: number;
      wins: number; losses: number; ties: number;
    }> = {};

    for (const team of teams) {
      const scores = scoresByTeamId.get(team.id) || [];
      const played = scores.filter((s) => !s.isDnp);
      const totalPts = scores.reduce((sum, s) => sum + s.points, 0);
      const totalNet = played.reduce((sum, s) => sum + s.netScore, 0);
      const validPositions = played.map((s) => s.position).filter((p) => p > 0);
      const bestFinish = validPositions.length > 0 ? Math.min(...validPositions) : 0;

      if (!teamStats[team.name]) {
        teamStats[team.name] = {
          name: team.name,
          totalPoints: 0,
          roundsPlayed: 0,
          netSum: 0,
          avgNet: 0,
          bestFinish: Infinity,
          matchCount: 0,
          wins: 0, losses: 0, ties: 0,
        };
      }
      teamStats[team.name].totalPoints += totalPts;
      teamStats[team.name].roundsPlayed += played.length;
      teamStats[team.name].matchCount += played.length;
      // Track running net sum to avoid floating-point drift from reconstructing sums from averages
      teamStats[team.name].netSum += totalNet;
      const entry = teamStats[team.name];
      entry.avgNet = entry.roundsPlayed > 0 ? entry.netSum / entry.roundsPlayed : 0;
      if (bestFinish > 0 && bestFinish < entry.bestFinish) entry.bestFinish = bestFinish;
    }

    return Object.values(teamStats)
      .map((s) => ({
        ...s,
        bestFinish: s.bestFinish === Infinity ? 0 : s.bestFinish,
        avgNet: Math.round(s.avgNet * 10) / 10,
      }))
      .sort((a, b) => {
        if (a.totalPoints !== b.totalPoints) return b.totalPoints - a.totalPoints;
        return a.avgNet - b.avgNet;
      });
  }

  // Match play / hybrid: existing logic
  const teamStats: Record<string, {
    name: string;
    totalPoints: number;
    wins: number;
    losses: number;
    ties: number;
    matchCount: number;
  }> = {};

  for (const team of teams) {
    if (!teamStats[team.name]) {
      teamStats[team.name] = {
        name: team.name,
        totalPoints: 0,
        wins: 0,
        losses: 0,
        ties: 0,
        matchCount: 0,
      };
    }
    teamStats[team.name].totalPoints += team.totalPoints;
    teamStats[team.name].wins += team.wins;
    teamStats[team.name].losses += team.losses;
    teamStats[team.name].ties += team.ties;
    teamStats[team.name].matchCount += team.wins + team.losses + team.ties;
  }

  return Object.values(teamStats).sort((a, b) => {
    if (a.totalPoints !== b.totalPoints) return b.totalPoints - a.totalPoints;
    if (a.wins !== b.wins) return b.wins - a.wins;
    return 0;
  });
}
