/**
 * Comprehensive smoke-test seed: creates 12 leagues with maximum configuration
 * diversity — match play, stroke play, hybrid, scorecards, courses, forfeits,
 * subs, multiple seasons, empty leagues, suspended leagues, etc.
 *
 * Run: npx tsx scripts/seed-smoke-test.ts
 */

if (process.env.TURSO_DATABASE_URL || process.env.NODE_ENV === "production") {
  console.error("ERROR: Seed scripts must not run against production databases.");
  console.error("Detected TURSO_DATABASE_URL or NODE_ENV=production. Aborting.");
  process.exit(1);
}

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import * as bcrypt from "bcryptjs";

const adapter = new PrismaLibSql({ url: "file:./dev.db" });
const prisma = new PrismaClient({ adapter });

// ============================================================
// Seeded random for reproducible data
// ============================================================
let seedValue = 42;
function seededRandom(): number {
  seedValue = (seedValue * 16807 + 0) % 2147483647;
  return (seedValue - 1) / 2147483646;
}

function randomInt(min: number, max: number): number {
  return min + Math.floor(seededRandom() * (max - min + 1));
}

// ============================================================
// Helper: round-robin pairings
// ============================================================
function roundRobinPairings(ids: number[], week: number): [number, number][] {
  if (ids.length < 2) return [];
  const rotated = [...ids];
  // For odd-length, add a "bye" sentinel
  const hasBye = rotated.length % 2 !== 0;
  if (hasBye) rotated.push(-1);

  for (let i = 0; i < (week - 1) % (rotated.length - 1); i++) {
    const last = rotated.pop()!;
    rotated.splice(1, 0, last);
  }

  const pairs: [number, number][] = [];
  for (let i = 0; i < Math.floor(rotated.length / 2); i++) {
    const a = rotated[i];
    const b = rotated[rotated.length - 1 - i];
    if (a !== -1 && b !== -1) {
      pairs.push([a, b]);
    }
  }
  return pairs;
}

// ============================================================
// Helper: generate gross score from base skill level
// ============================================================
function generateGross(base: number): number {
  return base + Math.floor(seededRandom() * 8);
}

// ============================================================
// Helper: generate hole-by-hole scores
// ============================================================
function generateHoleScores(
  pars: number[],
  skill: "elite" | "good" | "average" | "poor"
): number[] {
  return pars.map((par) => {
    switch (skill) {
      case "elite":
        return par + randomInt(-1, 1); // -1 to +1
      case "good":
        return par + randomInt(0, 2); // 0 to +2
      case "average":
        return par + randomInt(0, 3); // 0 to +3
      case "poor":
        return par + randomInt(1, 4); // +1 to +4
    }
  });
}

// ============================================================
// Helper: create a course with holes
// ============================================================
async function createCourse(
  leagueId: number,
  name: string,
  location: string,
  numberOfHoles: 9 | 18,
  parsArr: number[],
  yardagesArr: number[],
  hcpIdxArr: number[],
  teeColor?: string,
  courseRating?: number,
  slopeRating?: number
): Promise<{
  courseId: number;
  holes: { id: number; holeNumber: number; par: number }[];
  pars: number[];
  totalPar: number;
}> {
  const totalPar = parsArr.reduce((a, b) => a + b, 0);
  const course = await prisma.course.create({
    data: {
      leagueId,
      name,
      location,
      numberOfHoles,
      totalPar,
      teeColor: teeColor || "White",
      courseRating: courseRating || totalPar - 0.8,
      slopeRating: slopeRating || 121,
      isActive: true,
    },
  });

  const holes: { id: number; holeNumber: number; par: number }[] = [];
  for (let i = 0; i < parsArr.length; i++) {
    const hole = await prisma.hole.create({
      data: {
        courseId: course.id,
        holeNumber: i + 1,
        par: parsArr[i],
        handicapIndex: hcpIdxArr[i],
        yardage: yardagesArr[i],
      },
    });
    holes.push({ id: hole.id, holeNumber: i + 1, par: parsArr[i] });
  }

  return { courseId: course.id, holes, pars: parsArr, totalPar };
}

// ============================================================
// Helper: create matchups for a season with team stat updates
// ============================================================
async function createMatchups(opts: {
  leagueId: number;
  seasonId: number;
  teams: { id: number; base: number }[];
  weeks: number;
  baseScore: number;
  multiplier: number;
  forfeitWeek?: number;
  forfeitTeamIdx?: number;
  subWeek?: number;
  subTeamIdx?: number;
}): Promise<{ matchupIds: Map<string, number> }> {
  const {
    leagueId,
    seasonId,
    teams,
    weeks,
    baseScore,
    multiplier,
    forfeitWeek,
    forfeitTeamIdx,
    subWeek,
    subTeamIdx,
  } = opts;

  const teamScores: Record<number, number[]> = {};
  teams.forEach((t) => (teamScores[t.id] = []));

  // Map: "weekNumber-teamAId-teamBId" -> matchupId
  const matchupIds = new Map<string, number>();

  for (let week = 1; week <= weeks; week++) {
    const pairings = roundRobinPairings(
      teams.map((t) => t.id),
      week
    );

    for (const [aId, bId] of pairings) {
      const tA = teams.find((t) => t.id === aId)!;
      const tB = teams.find((t) => t.id === bId)!;

      // Check for forfeit
      const isForfeit =
        forfeitWeek === week &&
        forfeitTeamIdx !== undefined &&
        (teams[forfeitTeamIdx].id === aId ||
          teams[forfeitTeamIdx].id === bId);
      const forfeitTeamId = isForfeit ? teams[forfeitTeamIdx!].id : null;

      // Check for sub
      const aIsSub =
        subWeek === week &&
        subTeamIdx !== undefined &&
        teams[subTeamIdx].id === aId;
      const bIsSub =
        subWeek === week &&
        subTeamIdx !== undefined &&
        teams[subTeamIdx].id === bId;

      let aGross: number, bGross: number;
      let aHcap: number, bHcap: number;
      let aNet: number, bNet: number;
      let aPoints: number, bPoints: number;

      if (isForfeit) {
        // Forfeit: forfeiting team gets 0 points, other gets 20
        aGross = generateGross(tA.base);
        bGross = generateGross(tB.base);
        aHcap =
          teamScores[aId].length > 0
            ? Math.max(
                0,
                Math.floor(
                  (teamScores[aId].reduce((a, b) => a + b, 0) /
                    teamScores[aId].length -
                    baseScore) *
                    multiplier
                )
              )
            : Math.max(0, Math.floor((tA.base - baseScore) * multiplier));
        bHcap =
          teamScores[bId].length > 0
            ? Math.max(
                0,
                Math.floor(
                  (teamScores[bId].reduce((a, b) => a + b, 0) /
                    teamScores[bId].length -
                    baseScore) *
                    multiplier
                )
              )
            : Math.max(0, Math.floor((tB.base - baseScore) * multiplier));
        aNet = aGross - aHcap;
        bNet = bGross - bHcap;
        if (forfeitTeamId === aId) {
          aPoints = 0;
          bPoints = 20;
        } else {
          aPoints = 20;
          bPoints = 0;
        }
      } else {
        aGross = generateGross(tA.base);
        bGross = generateGross(tB.base);
        aHcap =
          teamScores[aId].length > 0
            ? Math.max(
                0,
                Math.floor(
                  (teamScores[aId].reduce((a, b) => a + b, 0) /
                    teamScores[aId].length -
                    baseScore) *
                    multiplier
                )
              )
            : Math.max(0, Math.floor((tA.base - baseScore) * multiplier));
        bHcap =
          teamScores[bId].length > 0
            ? Math.max(
                0,
                Math.floor(
                  (teamScores[bId].reduce((a, b) => a + b, 0) /
                    teamScores[bId].length -
                    baseScore) *
                    multiplier
                )
              )
            : Math.max(0, Math.floor((tB.base - baseScore) * multiplier));
        aNet = aGross - aHcap;
        bNet = bGross - bHcap;

        if (aNet < bNet) {
          aPoints = 12 + Math.floor(seededRandom() * 4);
          bPoints = 20 - aPoints;
        } else if (bNet < aNet) {
          bPoints = 12 + Math.floor(seededRandom() * 4);
          aPoints = 20 - bPoints;
        } else {
          aPoints = 10;
          bPoints = 10;
        }
      }

      const matchup = await prisma.matchup.create({
        data: {
          leagueId,
          seasonId,
          weekNumber: week,
          teamAId: aId,
          teamBId: bId,
          teamAGross: aGross,
          teamBGross: bGross,
          teamAHandicap: aHcap,
          teamBHandicap: bHcap,
          teamANet: aNet,
          teamBNet: bNet,
          teamAPoints: aPoints,
          teamBPoints: bPoints,
          teamAIsSub: aIsSub,
          teamBIsSub: bIsSub,
          isForfeit,
          forfeitTeamId: forfeitTeamId,
        },
      });

      matchupIds.set(`${week}-${aId}-${bId}`, matchup.id);

      if (!aIsSub && !isForfeit) teamScores[aId].push(aGross);
      if (!bIsSub && !isForfeit) teamScores[bId].push(bGross);

      // Update team stats
      const aWin = aPoints > bPoints ? 1 : 0;
      const bWin = bPoints > aPoints ? 1 : 0;
      const tie = aPoints === bPoints ? 1 : 0;

      await prisma.team.update({
        where: { id: aId },
        data: {
          totalPoints: { increment: aPoints },
          wins: { increment: aWin },
          losses: { increment: bWin },
          ties: { increment: tie },
        },
      });
      await prisma.team.update({
        where: { id: bId },
        data: {
          totalPoints: { increment: bPoints },
          wins: { increment: bWin },
          losses: { increment: aWin },
          ties: { increment: tie },
        },
      });
    }
  }

  return { matchupIds };
}

// ============================================================
// Helper: create scorecard with hole scores
// ============================================================
async function createScorecard(opts: {
  leagueId: number;
  courseId: number;
  teamId: number;
  seasonId: number;
  weekNumber: number;
  matchupId?: number;
  teamSide?: string;
  status: string;
  playerName: string;
  holes: { id: number; holeNumber: number; par: number }[];
  pars: number[];
  skill: "elite" | "good" | "average" | "poor";
}): Promise<void> {
  const {
    leagueId,
    courseId,
    teamId,
    seasonId,
    weekNumber,
    matchupId,
    teamSide,
    status,
    playerName,
    holes,
    pars,
    skill,
  } = opts;

  const scores = generateHoleScores(pars, skill);
  const grossTotal = scores.reduce((a, b) => a + b, 0);
  const frontNine = scores.slice(0, 9).reduce((a, b) => a + b, 0);
  const backNine =
    holes.length > 9 ? scores.slice(9).reduce((a, b) => a + b, 0) : null;

  const sc = await prisma.scorecard.create({
    data: {
      leagueId,
      courseId,
      teamId,
      seasonId,
      weekNumber,
      matchupId: matchupId || null,
      teamSide: teamSide || null,
      status,
      playerName,
      grossTotal,
      frontNine,
      backNine,
      completedAt:
        status === "completed" || status === "approved" ? new Date() : null,
      approvedAt: status === "approved" ? new Date() : null,
    },
  });

  for (let i = 0; i < holes.length; i++) {
    await prisma.holeScore.create({
      data: {
        scorecardId: sc.id,
        holeId: holes[i].id,
        holeNumber: i + 1,
        strokes: scores[i],
        putts: 1 + Math.floor(seededRandom() * 3),
        fairwayHit: seededRandom() > 0.4,
        greenInReg: seededRandom() > 0.5,
      },
    });
  }
}

// ============================================================
// Helper: create weekly scores for stroke play
// ============================================================
async function createWeeklyScores(opts: {
  leagueId: number;
  seasonId: number;
  teams: { id: number; base: number }[];
  weekNumber: number;
  baseScore: number;
  multiplier: number;
  pointScale: number[];
  bonusShow: number;
  bonusBeat: number;
  dnpTeamIds?: number[];
}): Promise<void> {
  const {
    leagueId,
    seasonId,
    teams,
    weekNumber,
    baseScore,
    multiplier,
    pointScale,
    bonusShow,
    bonusBeat,
    dnpTeamIds = [],
  } = opts;

  // Generate scores for non-DNP teams
  const entries: {
    teamId: number;
    grossScore: number;
    handicap: number;
    netScore: number;
    isDnp: boolean;
  }[] = [];

  for (const team of teams) {
    const isDnp = dnpTeamIds.includes(team.id);
    if (isDnp) {
      entries.push({
        teamId: team.id,
        grossScore: 0,
        handicap: 0,
        netScore: 999,
        isDnp: true,
      });
    } else {
      const gross = generateGross(team.base);
      const hcap = Math.max(
        0,
        Math.floor((team.base - baseScore) * multiplier)
      );
      const net = gross - hcap;
      entries.push({
        teamId: team.id,
        grossScore: gross,
        handicap: hcap,
        netScore: net,
        isDnp: false,
      });
    }
  }

  // Sort by netScore ascending to assign positions (DNP at bottom)
  const playing = entries.filter((e) => !e.isDnp);
  const dnp = entries.filter((e) => e.isDnp);
  playing.sort((a, b) => a.netScore - b.netScore);

  const sorted = [...playing, ...dnp];

  for (let i = 0; i < sorted.length; i++) {
    const entry = sorted[i];
    const position = i + 1;
    let points = 0;

    if (entry.isDnp) {
      points = 0; // DNP gets 0 points
    } else {
      // Assign points from scale (position-1 index, default 0 if out of range)
      points = i < pointScale.length ? pointScale[i] : 0;
      // Add show bonus
      points += bonusShow;
      // Add beat-handicap bonus: if net < baseScore, they beat their handicap
      if (entry.netScore < baseScore) {
        points += bonusBeat;
      }
    }

    await prisma.weeklyScore.create({
      data: {
        leagueId,
        seasonId,
        teamId: entry.teamId,
        weekNumber,
        grossScore: entry.grossScore,
        handicap: entry.handicap,
        netScore: entry.isDnp ? 0 : entry.netScore,
        points,
        position,
        isDnp: entry.isDnp,
        isSub: false,
      },
    });

    // Update team total points
    await prisma.team.update({
      where: { id: entry.teamId },
      data: { totalPoints: { increment: points } },
    });
  }
}

// ============================================================
// Helper: create teams for a league/season
// ============================================================
async function createTeams(
  leagueId: number,
  seasonId: number,
  names: string[],
  bases: number[]
): Promise<{ id: number; name: string; base: number }[]> {
  const teams: { id: number; name: string; base: number }[] = [];
  for (let i = 0; i < names.length; i++) {
    const team = await prisma.team.create({
      data: {
        name: names[i],
        leagueId,
        seasonId,
        captainName: `Captain ${names[i]}`,
        email: `team${i + 1}@league.com`,
        status: "approved",
      },
    });
    teams.push({ id: team.id, name: team.name, base: bases[i] });
  }
  return teams;
}

// ============================================================
// Course data
// ============================================================
const PINE_VALLEY_PARS = [4, 3, 5, 4, 4, 3, 4, 5, 4]; // par 36
const PINE_VALLEY_YARDS = [385, 165, 520, 410, 350, 185, 395, 505, 370];
const PINE_VALLEY_HCP = [3, 7, 1, 5, 9, 8, 4, 2, 6];

const MEADOW_LINKS_PARS = [4, 3, 4, 3, 4, 4, 3, 5, 4]; // par 34
const MEADOW_LINKS_YARDS = [340, 145, 380, 155, 365, 390, 160, 470, 355];
const MEADOW_LINKS_HCP = [5, 9, 3, 8, 4, 2, 7, 1, 6];

const OAKMONT_PARS = [4, 4, 3, 5, 4, 4, 3, 4, 5, 4, 3, 5, 4, 4, 3, 4, 5, 4]; // par 72
const OAKMONT_YARDS = [
  480, 430, 185, 540, 395, 460, 195, 415, 510, 465, 175, 525, 405, 445, 210,
  425, 505, 380,
];
const OAKMONT_HCP = [1, 5, 13, 3, 9, 7, 17, 11, 15, 2, 14, 4, 8, 6, 16, 10, 12, 18];

const AUGUSTA_PARS = [4, 5, 4, 3, 4, 4, 3, 5, 4, 4, 4, 3, 5, 4, 3, 5, 4, 4]; // par 72
const AUGUSTA_YARDS = [
  445, 575, 350, 240, 455, 440, 180, 570, 460, 495, 420, 155, 510, 440, 200,
  530, 400, 465,
];
const AUGUSTA_HCP = [4, 8, 14, 12, 2, 6, 16, 10, 18, 1, 7, 15, 3, 5, 13, 9, 11, 17];

// ============================================================
// Main seed function
// ============================================================
async function seed() {
  const startTime = Date.now();
  console.log("=".repeat(70));
  console.log("  COMPREHENSIVE SMOKE TEST SEED — 12 Leagues");
  console.log("=".repeat(70));
  console.log();

  // ── Clear ALL data ──
  console.log("Clearing all existing data...");
  await prisma.holeScore.deleteMany();
  await prisma.scorecard.deleteMany();
  await prisma.hole.deleteMany();
  await prisma.course.deleteMany();
  await prisma.scheduledMatchup.deleteMany();
  await prisma.matchup.deleteMany();
  await prisma.weeklyScore.deleteMany();
  await prisma.team.deleteMany();
  await prisma.season.deleteMany();
  await prisma.league.deleteMany();
  await prisma.superAdmin.deleteMany();
  console.log("  All data cleared.\n");

  // ── Super Admin ──
  const sudoHash = await bcrypt.hash("sudo123!", 12);
  await prisma.superAdmin.create({
    data: { username: "alex", password: sudoHash },
  });
  console.log("Super admin created: alex / sudo123!\n");

  const pw = await bcrypt.hash("admin123", 12);

  // ================================================================
  // LEAGUE 1: "Thursday Night Golf" — Classic Match Play, 9-hole,
  //           scorecards enabled
  // ================================================================
  console.log("League 1: Thursday Night Golf");
  console.log("-".repeat(40));

  const league1 = await prisma.league.create({
    data: {
      name: "Thursday Night Golf",
      slug: "thursday-night-golf",
      adminUsername: "admin",
      adminPassword: pw,
      maxTeams: 12,
      registrationOpen: true,
      courseName: "Pine Valley Golf Club",
      courseLocation: "Pine Valley, NJ",
      playDay: "Thursday",
      playTime: "5:30 PM",
      description:
        "A friendly weekly 9-hole match play league. All skill levels welcome!",
      contactEmail: "admin@thursdaynightgolf.com",
      handicapBaseScore: 36,
      handicapMultiplier: 0.9,
      handicapRounding: "floor",
      handicapDefault: 0,
      handicapMax: 9,
      scorecardMode: "optional",
      scorecardRequireApproval: true,
      status: "active",
    },
  });

  const season1 = await prisma.season.create({
    data: {
      leagueId: league1.id,
      name: "2026 Season",
      year: 2026,
      seasonNumber: 1,
      isActive: true,
      numberOfWeeks: 8,
    },
  });

  const course1 = await createCourse(
    league1.id,
    "Pine Valley Golf Club",
    "Pine Valley, NJ",
    9,
    PINE_VALLEY_PARS,
    PINE_VALLEY_YARDS,
    PINE_VALLEY_HCP,
    "White",
    35.2,
    121
  );

  const l1Names = [
    "The Bogey Boys",
    "Fairway Legends",
    "Par-Tee Time",
    "Slice & Dice",
    "The Mulligans",
    "Birdie Brigade",
    "Eagle Eyes",
    "Green Machine",
  ];
  const l1Bases = [40, 38, 42, 44, 41, 39, 43, 45];
  const teams1 = await createTeams(league1.id, season1.id, l1Names, l1Bases);

  // Create 8 weeks of matchups with 1 forfeit (week 5) and 1 sub (week 3)
  const { matchupIds: l1Matchups } = await createMatchups({
    leagueId: league1.id,
    seasonId: season1.id,
    teams: teams1,
    weeks: 8,
    baseScore: 36,
    multiplier: 0.9,
    forfeitWeek: 5,
    forfeitTeamIdx: 3, // Slice & Dice forfeits
    subWeek: 3,
    subTeamIdx: 6, // Eagle Eyes has a sub
  });

  // Scorecards: approved for teams 0-3 on weeks 7-8, mixed statuses on week 8
  const skillMap: Record<number, "elite" | "good" | "average" | "poor"> = {};
  teams1.forEach((t, i) => {
    if (i < 2) skillMap[t.id] = "elite";
    else if (i < 5) skillMap[t.id] = "good";
    else skillMap[t.id] = "average";
  });

  // Week 7: approved scorecards for teams 0-3
  for (let i = 0; i < 4; i++) {
    await createScorecard({
      leagueId: league1.id,
      courseId: course1.courseId,
      teamId: teams1[i].id,
      seasonId: season1.id,
      weekNumber: 7,
      status: "approved",
      playerName: `Player ${l1Names[i]}`,
      holes: course1.holes,
      pars: course1.pars,
      skill: skillMap[teams1[i].id],
    });
  }

  // Week 8 (current week): mixed statuses
  await createScorecard({
    leagueId: league1.id,
    courseId: course1.courseId,
    teamId: teams1[0].id,
    seasonId: season1.id,
    weekNumber: 8,
    status: "approved",
    playerName: `Player ${l1Names[0]}`,
    holes: course1.holes,
    pars: course1.pars,
    skill: "elite",
  });
  await createScorecard({
    leagueId: league1.id,
    courseId: course1.courseId,
    teamId: teams1[1].id,
    seasonId: season1.id,
    weekNumber: 8,
    status: "completed",
    playerName: `Player ${l1Names[1]}`,
    holes: course1.holes,
    pars: course1.pars,
    skill: "elite",
  });
  await createScorecard({
    leagueId: league1.id,
    courseId: course1.courseId,
    teamId: teams1[2].id,
    seasonId: season1.id,
    weekNumber: 8,
    status: "in_progress",
    playerName: `Player ${l1Names[2]}`,
    holes: course1.holes,
    pars: course1.pars,
    skill: "good",
  });
  // Team 3: in_progress with no hole scores (just started)
  await prisma.scorecard.create({
    data: {
      leagueId: league1.id,
      courseId: course1.courseId,
      teamId: teams1[3].id,
      seasonId: season1.id,
      weekNumber: 8,
      status: "in_progress",
      playerName: `Player ${l1Names[3]}`,
    },
  });

  console.log(
    "  8 teams, 1 season, 8 weeks, 1 forfeit, 1 sub, scorecards on wk 7-8"
  );
  console.log();

  // ================================================================
  // LEAGUE 2: "Saturday Morning Golf" — Match Play, different handicap
  // ================================================================
  console.log("League 2: Saturday Morning Golf");
  console.log("-".repeat(40));

  const league2 = await prisma.league.create({
    data: {
      name: "Saturday Morning Golf",
      slug: "saturday-morning-golf",
      adminUsername: "admin",
      adminPassword: pw,
      maxTeams: 8,
      registrationOpen: false,
      courseName: "Sunrise Golf Course",
      courseLocation: "Riverside, CA",
      playDay: "Saturday",
      playTime: "7:00 AM",
      description:
        "Start your weekend right with our early morning golf league. Coffee provided!",
      contactEmail: "saturday@golfleague.com",
      handicapBaseScore: 36,
      handicapMultiplier: 0.8,
      handicapRounding: "round",
      handicapDefault: 0,
      scorecardMode: "disabled",
      status: "active",
    },
  });

  const season2 = await prisma.season.create({
    data: {
      leagueId: league2.id,
      name: "2026 Season",
      year: 2026,
      seasonNumber: 1,
      isActive: true,
      numberOfWeeks: 5,
    },
  });

  const l2Names = [
    "Morning Mulligans",
    "Sunrise Swingers",
    "Early Birds",
    "Dew Sweepers",
    "Coffee & Clubs",
    "Dawn Drivers",
  ];
  const l2Bases = [41, 39, 43, 40, 44, 42];
  const teams2 = await createTeams(league2.id, season2.id, l2Names, l2Bases);

  await createMatchups({
    leagueId: league2.id,
    seasonId: season2.id,
    teams: teams2,
    weeks: 5,
    baseScore: 36,
    multiplier: 0.8,
  });

  console.log("  6 teams, 1 season, 5 weeks, no scorecards");
  console.log();

  // ================================================================
  // LEAGUE 3: "Sunset Stroke Play League" — Pure Stroke Play
  // ================================================================
  console.log("League 3: Sunset Stroke Play League");
  console.log("-".repeat(40));

  const league3 = await prisma.league.create({
    data: {
      name: "Sunset Stroke Play League",
      slug: "sunset-stroke-play",
      adminUsername: "admin",
      adminPassword: pw,
      maxTeams: 12,
      registrationOpen: false,
      courseName: "Sunset Ridge GC",
      courseLocation: "Mesa, AZ",
      playDay: "Tuesday",
      playTime: "6:00 PM",
      description: "A competitive stroke play league with weighted points and bonuses.",
      contactEmail: "sunset@golfleague.com",
      handicapBaseScore: 36,
      handicapMultiplier: 0.85,
      handicapRounding: "floor",
      handicapDefault: 0,
      handicapScoreSelection: "best_of_last",
      handicapBestOf: 4,
      handicapLastOf: 8,
      scoringType: "stroke_play",
      strokePlayPointPreset: "weighted",
      strokePlayBonusShow: 2,
      strokePlayBonusBeat: 3,
      strokePlayDnpPoints: 0,
      strokePlayDnpPenalty: -5,
      scorecardMode: "disabled",
      status: "active",
    },
  });

  const season3 = await prisma.season.create({
    data: {
      leagueId: league3.id,
      name: "2026 Season",
      year: 2026,
      seasonNumber: 1,
      isActive: true,
      numberOfWeeks: 10,
      scoringType: "stroke_play",
    },
  });

  const l3Names = [
    "Sunset Sluggers",
    "Twilight Tigers",
    "Dusk Devils",
    "Golden Hour Golf",
    "Afterglow Aces",
    "Evening Eagles",
    "Sundown Swingers",
    "Horizon Hawks",
    "Crimson Drivers",
    "Amber Archers",
  ];
  const l3Bases = [38, 40, 42, 39, 44, 41, 43, 45, 37, 46];
  const teams3 = await createTeams(league3.id, season3.id, l3Names, l3Bases);

  // Weighted point scale for 10 teams
  const weightedScale = [20, 16, 13, 11, 9, 7, 5, 3, 2, 1];

  // Create weekly scores for all 10 weeks, with 1-2 DNPs scattered
  for (let week = 1; week <= 10; week++) {
    const dnpTeamIds: number[] = [];
    // Week 4: team index 7 DNP
    if (week === 4) dnpTeamIds.push(teams3[7].id);
    // Week 8: team index 3 and 9 DNP
    if (week === 8) {
      dnpTeamIds.push(teams3[3].id);
      dnpTeamIds.push(teams3[9].id);
    }

    await createWeeklyScores({
      leagueId: league3.id,
      seasonId: season3.id,
      teams: teams3,
      weekNumber: week,
      baseScore: 36,
      multiplier: 0.85,
      pointScale: weightedScale,
      bonusShow: 2,
      bonusBeat: 3,
      dnpTeamIds,
    });
  }

  console.log(
    "  10 teams, 1 season, 10 weeks stroke play, 3 DNP entries"
  );
  console.log();

  // ================================================================
  // LEAGUE 4: "Competitive Match Play" — USGA-style strict, 2 seasons
  // ================================================================
  console.log("League 4: Competitive Match Play");
  console.log("-".repeat(40));

  const league4 = await prisma.league.create({
    data: {
      name: "Competitive Match Play",
      slug: "competitive-match-play",
      adminUsername: "admin",
      adminPassword: pw,
      maxTeams: 10,
      registrationOpen: false,
      courseName: "Oakmont Country Club",
      courseLocation: "Oakmont, PA",
      playDay: "Wednesday",
      playTime: "5:00 PM",
      description:
        "A competitive 18-hole match play league with strict USGA-style handicapping.",
      contactEmail: "competitive@golfleague.com",
      handicapBaseScore: 35,
      handicapMultiplier: 0.96,
      handicapRounding: "floor",
      handicapDefault: 0,
      handicapMax: 18,
      handicapMin: 0,
      handicapScoreSelection: "best_of_last",
      handicapBestOf: 4,
      handicapLastOf: 8,
      handicapCapExceptional: true,
      handicapExceptionalCap: 50,
      handicapProvWeeks: 4,
      handicapProvMultiplier: 0.8,
      scorecardMode: "required",
      scorecardRequireApproval: true,
      status: "active",
    },
  });

  // Season 1 (2025) — inactive/completed
  const season4a = await prisma.season.create({
    data: {
      leagueId: league4.id,
      name: "2025 Season",
      year: 2025,
      seasonNumber: 1,
      isActive: false,
      numberOfWeeks: 14,
    },
  });

  const l4Names = [
    "Iron Wolves",
    "Steel Eagles",
    "Titanium Tigers",
    "Carbon Crushers",
    "Diamond Drives",
    "Platinum Putters",
    "Cobalt Crew",
    "Chrome Clubs",
  ];
  const l4Bases2025 = [76, 78, 80, 74, 82, 79, 77, 84]; // 18-hole bases
  const teams4a = await createTeams(
    league4.id,
    season4a.id,
    l4Names,
    l4Bases2025
  );

  await createMatchups({
    leagueId: league4.id,
    seasonId: season4a.id,
    teams: teams4a,
    weeks: 14,
    baseScore: 35,
    multiplier: 0.96,
  });

  // Season 2 (2026) — active
  const season4b = await prisma.season.create({
    data: {
      leagueId: league4.id,
      name: "2026 Season",
      year: 2026,
      seasonNumber: 2,
      isActive: true,
      numberOfWeeks: 14,
    },
  });

  const course4 = await createCourse(
    league4.id,
    "Oakmont Country Club",
    "Oakmont, PA",
    18,
    OAKMONT_PARS,
    OAKMONT_YARDS,
    OAKMONT_HCP,
    "Blue",
    73.2,
    145
  );

  const l4Bases2026 = [75, 77, 79, 73, 81, 78, 76, 83];
  const teams4b = await createTeams(
    league4.id,
    season4b.id,
    l4Names,
    l4Bases2026
  );

  const { matchupIds: l4Matchups } = await createMatchups({
    leagueId: league4.id,
    seasonId: season4b.id,
    teams: teams4b,
    weeks: 6,
    baseScore: 35,
    multiplier: 0.96,
  });

  // Full scorecards on current season (weeks 1-6)
  const l4Skills: ("elite" | "good" | "average" | "poor")[] = [
    "elite",
    "good",
    "good",
    "elite",
    "average",
    "good",
    "good",
    "poor",
  ];
  for (let week = 1; week <= 6; week++) {
    const pairings = roundRobinPairings(
      teams4b.map((t) => t.id),
      week
    );
    for (const [aId, bId] of pairings) {
      const aIdx = teams4b.findIndex((t) => t.id === aId);
      const bIdx = teams4b.findIndex((t) => t.id === bId);
      const matchupKey = `${week}-${aId}-${bId}`;
      const mId = l4Matchups.get(matchupKey);

      await createScorecard({
        leagueId: league4.id,
        courseId: course4.courseId,
        teamId: aId,
        seasonId: season4b.id,
        weekNumber: week,
        matchupId: mId,
        teamSide: "A",
        status: "approved",
        playerName: `Player ${l4Names[aIdx]}`,
        holes: course4.holes,
        pars: course4.pars,
        skill: l4Skills[aIdx],
      });
      await createScorecard({
        leagueId: league4.id,
        courseId: course4.courseId,
        teamId: bId,
        seasonId: season4b.id,
        weekNumber: week,
        matchupId: mId,
        teamSide: "B",
        status: "approved",
        playerName: `Player ${l4Names[bIdx]}`,
        holes: course4.holes,
        pars: course4.pars,
        skill: l4Skills[bIdx],
      });
    }
  }

  console.log(
    "  8 teams, 2 seasons (2025 inactive/14wk, 2026 active/6wk), 18-hole scorecards"
  );
  console.log();

  // ================================================================
  // LEAGUE 5: "Hybrid Scoring League" — Hybrid mode
  // ================================================================
  console.log("League 5: Hybrid Scoring League");
  console.log("-".repeat(40));

  const league5 = await prisma.league.create({
    data: {
      name: "Hybrid Scoring League",
      slug: "hybrid-scoring",
      adminUsername: "admin",
      adminPassword: pw,
      maxTeams: 10,
      registrationOpen: false,
      courseName: "Twin Oaks GC",
      courseLocation: "Denver, CO",
      playDay: "Monday",
      playTime: "5:30 PM",
      description:
        "A hybrid scoring league combining match play head-to-head with field-based stroke play points.",
      contactEmail: "hybrid@golfleague.com",
      handicapBaseScore: 36,
      handicapMultiplier: 0.9,
      handicapRounding: "floor",
      handicapDefault: 0,
      handicapScoreSelection: "all",
      scoringType: "hybrid",
      hybridFieldWeight: 0.6,
      scorecardMode: "disabled",
      status: "active",
    },
  });

  const season5 = await prisma.season.create({
    data: {
      leagueId: league5.id,
      name: "2026 Season",
      year: 2026,
      seasonNumber: 1,
      isActive: true,
      numberOfWeeks: 6,
      scoringType: "hybrid",
    },
  });

  const l5Names = [
    "Hybrid Heroes",
    "Dual Threat",
    "Best of Both",
    "Two-Way Aces",
    "Mixed Masters",
    "Combo Kings",
    "Switch Hitters",
    "Flex Players",
  ];
  const l5Bases = [39, 41, 43, 38, 44, 40, 42, 45];
  const teams5 = await createTeams(league5.id, season5.id, l5Names, l5Bases);

  // Hybrid: both matchups AND weeklyScores for each week
  await createMatchups({
    leagueId: league5.id,
    seasonId: season5.id,
    teams: teams5,
    weeks: 6,
    baseScore: 36,
    multiplier: 0.9,
  });

  const hybridScale = [16, 12, 10, 8, 6, 4, 2, 1];
  for (let week = 1; week <= 6; week++) {
    await createWeeklyScores({
      leagueId: league5.id,
      seasonId: season5.id,
      teams: teams5,
      weekNumber: week,
      baseScore: 36,
      multiplier: 0.9,
      pointScale: hybridScale,
      bonusShow: 0,
      bonusBeat: 0,
    });
  }

  console.log("  8 teams, 1 season, 6 weeks, hybrid (matchups + weekly scores)");
  console.log();

  // ================================================================
  // LEAGUE 6: "Beginner Friendly League" — Forgiving settings
  // ================================================================
  console.log("League 6: Beginner Friendly League");
  console.log("-".repeat(40));

  const league6 = await prisma.league.create({
    data: {
      name: "Beginner Friendly League",
      slug: "beginner-friendly",
      adminUsername: "admin",
      adminPassword: pw,
      maxTeams: 10,
      registrationOpen: true,
      courseName: "Meadow Links",
      courseLocation: "Portland, OR",
      playDay: "Sunday",
      playTime: "10:00 AM",
      description:
        "A welcoming league for new golfers. Forgiving handicap system and friendly competition.",
      contactEmail: "beginner@golfleague.com",
      handicapBaseScore: 40,
      handicapMultiplier: 1.1,
      handicapRounding: "ceil",
      handicapDefault: 5,
      handicapMax: 36,
      handicapScoreSelection: "last_n",
      handicapScoreCount: 5,
      handicapDropHighest: 1,
      scorecardMode: "optional",
      scorecardRequireApproval: false,
      status: "active",
    },
  });

  const season6 = await prisma.season.create({
    data: {
      leagueId: league6.id,
      name: "2026 Season",
      year: 2026,
      seasonNumber: 1,
      isActive: true,
      numberOfWeeks: 4,
    },
  });

  const course6 = await createCourse(
    league6.id,
    "Meadow Links",
    "Portland, OR",
    9,
    MEADOW_LINKS_PARS,
    MEADOW_LINKS_YARDS,
    MEADOW_LINKS_HCP,
    "White",
    33.5,
    115
  );

  const l6Names = [
    "Happy Hackers",
    "Relaxed Rounds",
    "Fun Fore All",
    "Casual Swingers",
    "Easy Breezy",
    "Good Vibes Golf",
  ];
  const l6Bases = [44, 46, 48, 45, 47, 43];
  const teams6 = await createTeams(league6.id, season6.id, l6Names, l6Bases);

  await createMatchups({
    leagueId: league6.id,
    seasonId: season6.id,
    teams: teams6,
    weeks: 4,
    baseScore: 40,
    multiplier: 1.1,
  });

  // Some scorecards for weeks 3-4
  const l6Skills: ("elite" | "good" | "average" | "poor")[] = [
    "average",
    "poor",
    "poor",
    "average",
    "poor",
    "average",
  ];
  for (let i = 0; i < 3; i++) {
    await createScorecard({
      leagueId: league6.id,
      courseId: course6.courseId,
      teamId: teams6[i].id,
      seasonId: season6.id,
      weekNumber: 3,
      status: "approved",
      playerName: `Player ${l6Names[i]}`,
      holes: course6.holes,
      pars: course6.pars,
      skill: l6Skills[i],
    });
  }
  for (let i = 0; i < 4; i++) {
    await createScorecard({
      leagueId: league6.id,
      courseId: course6.courseId,
      teamId: teams6[i].id,
      seasonId: season6.id,
      weekNumber: 4,
      status: i < 2 ? "completed" : "in_progress",
      playerName: `Player ${l6Names[i]}`,
      holes: course6.holes,
      pars: course6.pars,
      skill: l6Skills[i],
    });
  }

  console.log(
    "  6 teams, 1 season, 4 weeks, forgiving handicap, some scorecards"
  );
  console.log();

  // ================================================================
  // LEAGUE 7: "PGA Style League" — Premium stroke play
  // ================================================================
  console.log("League 7: PGA Style League");
  console.log("-".repeat(40));

  const league7 = await prisma.league.create({
    data: {
      name: "PGA Style League",
      slug: "pga-style",
      adminUsername: "admin",
      adminPassword: pw,
      maxTeams: 14,
      registrationOpen: false,
      courseName: "Championship Links",
      courseLocation: "Scottsdale, AZ",
      playDay: "Friday",
      playTime: "4:00 PM",
      description:
        "PGA-style stroke play with pro-rated standings, trend-adjusted handicaps, and split ties.",
      contactEmail: "pga@golfleague.com",
      handicapBaseScore: 36,
      handicapMultiplier: 0.9,
      handicapRounding: "floor",
      handicapDefault: 0,
      handicapUseTrend: true,
      handicapTrendWeight: 0.15,
      scoringType: "stroke_play",
      strokePlayPointPreset: "pga_style",
      strokePlayProRate: true,
      strokePlayTieMode: "split",
      scorecardMode: "disabled",
      status: "active",
    },
  });

  const season7 = await prisma.season.create({
    data: {
      leagueId: league7.id,
      name: "2026 Season",
      year: 2026,
      seasonNumber: 1,
      isActive: true,
      numberOfWeeks: 8,
      scoringType: "stroke_play",
    },
  });

  const l7Names = [
    "Tour Pros",
    "The Contenders",
    "Major Hopefuls",
    "Leaderboard Chasers",
    "Cut Makers",
    "Pin Seekers",
    "Fairway Finders",
    "Approach Artists",
    "Clutch Putters",
    "Shot Shapers",
    "Green Readers",
    "Distance Kings",
  ];
  const l7Bases = [37, 39, 41, 38, 43, 40, 42, 44, 36, 45, 40, 46];
  const teams7 = await createTeams(league7.id, season7.id, l7Names, l7Bases);

  // PGA-style point scale for 12 teams
  const pgaScale = [25, 20, 17, 14, 12, 10, 8, 6, 5, 4, 3, 2];

  for (let week = 1; week <= 8; week++) {
    await createWeeklyScores({
      leagueId: league7.id,
      seasonId: season7.id,
      teams: teams7,
      weekNumber: week,
      baseScore: 36,
      multiplier: 0.9,
      pointScale: pgaScale,
      bonusShow: 0,
      bonusBeat: 0,
    });
  }

  console.log("  12 teams, 1 season, 8 weeks stroke play, PGA style + trend");
  console.log();

  // ================================================================
  // LEAGUE 8: "Tiny League" — Minimal, 4 teams
  // ================================================================
  console.log("League 8: Tiny League");
  console.log("-".repeat(40));

  const league8 = await prisma.league.create({
    data: {
      name: "Tiny League",
      slug: "tiny-league",
      adminUsername: "admin",
      adminPassword: pw,
      maxTeams: 4,
      registrationOpen: false,
      courseName: "Backyard Par 3",
      courseLocation: "Smalltown, USA",
      playDay: "Saturday",
      playTime: "9:00 AM",
      description: "A small but mighty 4-team league with double round-robin play.",
      contactEmail: "tiny@golfleague.com",
      handicapBaseScore: 35,
      handicapMultiplier: 0.9,
      handicapRounding: "floor",
      handicapDefault: 0,
      scorecardMode: "disabled",
      status: "active",
    },
  });

  const season8 = await prisma.season.create({
    data: {
      leagueId: league8.id,
      name: "2026 Season",
      year: 2026,
      seasonNumber: 1,
      isActive: true,
      numberOfWeeks: 12,
    },
  });

  const l8Names = ["Alpha", "Bravo", "Charlie", "Delta"];
  const l8Bases = [39, 41, 43, 40];
  const teams8 = await createTeams(league8.id, season8.id, l8Names, l8Bases);

  await createMatchups({
    leagueId: league8.id,
    seasonId: season8.id,
    teams: teams8,
    weeks: 12,
    baseScore: 35,
    multiplier: 0.9,
  });

  console.log("  4 teams, 1 season, 12 weeks (double round-robin)");
  console.log();

  // ================================================================
  // LEAGUE 9: "Big League" — Large, 16 teams
  // ================================================================
  console.log("League 9: Big League");
  console.log("-".repeat(40));

  const league9 = await prisma.league.create({
    data: {
      name: "Big League",
      slug: "big-league",
      adminUsername: "admin",
      adminPassword: pw,
      maxTeams: 20,
      registrationOpen: false,
      courseName: "Grand National GC",
      courseLocation: "Augusta, GA",
      playDay: "Thursday",
      playTime: "5:00 PM",
      description:
        "A 16-team league with playoffs, bye handling, and weighted handicaps.",
      contactEmail: "big@golfleague.com",
      handicapBaseScore: 36,
      handicapMultiplier: 0.9,
      handicapRounding: "floor",
      handicapDefault: 0,
      handicapUseWeighting: true,
      handicapWeightRecent: 1.5,
      handicapWeightDecay: 0.9,
      playoffWeeks: 2,
      playoffTeams: 8,
      playoffFormat: "single_elimination",
      byePointsMode: "league_average",
      scorecardMode: "disabled",
      status: "active",
    },
  });

  const season9 = await prisma.season.create({
    data: {
      leagueId: league9.id,
      name: "2026 Season",
      year: 2026,
      seasonNumber: 1,
      isActive: true,
      numberOfWeeks: 8,
    },
  });

  const l9Names = Array.from({ length: 16 }, (_, i) => `Team ${i + 1}`);
  const l9Bases = [
    38, 40, 42, 39, 44, 41, 43, 45, 37, 46, 40, 42, 38, 44, 41, 43,
  ];
  const teams9 = await createTeams(league9.id, season9.id, l9Names, l9Bases);

  // 8 weeks with 2 forfeits and 2 subs scattered
  await createMatchups({
    leagueId: league9.id,
    seasonId: season9.id,
    teams: teams9,
    weeks: 8,
    baseScore: 36,
    multiplier: 0.9,
    forfeitWeek: 3,
    forfeitTeamIdx: 12, // Team 13 forfeits week 3
    subWeek: 5,
    subTeamIdx: 7, // Team 8 has a sub week 5
  });

  // A second forfeit on week 6 — create manually
  // Find a matchup in week 6 involving team 15 and update it
  const w6Matchup = await prisma.matchup.findFirst({
    where: {
      leagueId: league9.id,
      seasonId: season9.id,
      weekNumber: 6,
      OR: [{ teamAId: teams9[14].id }, { teamBId: teams9[14].id }],
    },
  });
  if (w6Matchup) {
    const forfeitId = teams9[14].id;
    const oldAPoints = w6Matchup.teamAPoints;
    const oldBPoints = w6Matchup.teamBPoints;
    const newAPoints = w6Matchup.teamAId === forfeitId ? 0 : 20;
    const newBPoints = w6Matchup.teamBId === forfeitId ? 0 : 20;

    await prisma.matchup.update({
      where: { id: w6Matchup.id },
      data: {
        isForfeit: true,
        forfeitTeamId: forfeitId,
        teamAPoints: newAPoints,
        teamBPoints: newBPoints,
      },
    });

    // Adjust team stats for the points change
    const aDiff = newAPoints - oldAPoints;
    const bDiff = newBPoints - oldBPoints;
    if (aDiff !== 0) {
      await prisma.team.update({
        where: { id: w6Matchup.teamAId },
        data: { totalPoints: { increment: aDiff } },
      });
    }
    if (bDiff !== 0) {
      await prisma.team.update({
        where: { id: w6Matchup.teamBId },
        data: { totalPoints: { increment: bDiff } },
      });
    }
  }

  console.log(
    "  16 teams, 1 season, 8 weeks, 2 forfeits, 1 sub, playoff config"
  );
  console.log();

  // ================================================================
  // LEAGUE 10: "Summer Golf 2026" — Empty, brand new
  // ================================================================
  console.log("League 10: Summer Golf 2026");
  console.log("-".repeat(40));

  await prisma.league.create({
    data: {
      name: "Summer Golf 2026",
      slug: "summer-golf-2026",
      adminUsername: "admin",
      adminPassword: pw,
      maxTeams: 16,
      registrationOpen: true,
      description:
        "Brand new league starting this summer. Sign up now! No teams or seasons yet.",
      contactEmail: "summer@golfleague.com",
      handicapBaseScore: 36,
      handicapMultiplier: 0.9,
      handicapRounding: "floor",
      handicapDefault: 0,
      status: "active",
    },
  });

  console.log("  Empty — no teams, no seasons, registration open");
  console.log();

  // ================================================================
  // LEAGUE 11: "Winter Indoor League" — Suspended
  // ================================================================
  console.log("League 11: Winter Indoor League");
  console.log("-".repeat(40));

  const league11 = await prisma.league.create({
    data: {
      name: "Winter Indoor League",
      slug: "winter-indoor",
      adminUsername: "admin",
      adminPassword: pw,
      maxTeams: 8,
      registrationOpen: false,
      courseName: "Indoor Golf Simulator",
      courseLocation: "Chicago, IL",
      playDay: "Wednesday",
      playTime: "7:00 PM",
      description:
        "Indoor golf simulator league — suspended for the season. Check back in fall.",
      contactEmail: "winter@golfleague.com",
      handicapBaseScore: 36,
      handicapMultiplier: 0.9,
      handicapRounding: "floor",
      handicapDefault: 0,
      scorecardMode: "disabled",
      status: "suspended",
    },
  });

  const season11 = await prisma.season.create({
    data: {
      leagueId: league11.id,
      name: "2025-2026 Winter Season",
      year: 2025,
      seasonNumber: 1,
      isActive: false,
      numberOfWeeks: 10,
    },
  });

  const l11Names = [
    "Frosty Fairways",
    "Icicle Irons",
    "Snowbound Swingers",
    "Polar Putters",
    "Arctic Aces",
    "Winter Warriors",
  ];
  const l11Bases = [40, 42, 44, 41, 43, 39];
  const teams11 = await createTeams(
    league11.id,
    season11.id,
    l11Names,
    l11Bases
  );

  // All 10 weeks complete
  await createMatchups({
    leagueId: league11.id,
    seasonId: season11.id,
    teams: teams11,
    weeks: 10,
    baseScore: 36,
    multiplier: 0.9,
  });

  console.log(
    "  6 teams, 1 completed season (10 weeks), status: suspended"
  );
  console.log();

  // ================================================================
  // LEAGUE 12: "Championship Tour" — Weighted handicaps, 18-hole,
  //            scorecards required
  // ================================================================
  console.log("League 12: Championship Tour");
  console.log("-".repeat(40));

  const league12 = await prisma.league.create({
    data: {
      name: "Championship Tour",
      slug: "championship-tour",
      adminUsername: "admin",
      adminPassword: pw,
      maxTeams: 12,
      registrationOpen: false,
      courseName: "Augusta Replica",
      courseLocation: "Savannah, GA",
      playDay: "Saturday",
      playTime: "8:00 AM",
      description:
        "Championship-caliber 18-hole league with weighted handicaps and required scorecards.",
      contactEmail: "championship@golfleague.com",
      handicapBaseScore: 72,
      handicapMultiplier: 0.9,
      handicapRounding: "floor",
      handicapDefault: 0,
      handicapMax: 36,
      handicapMin: 0,
      handicapUseWeighting: true,
      handicapWeightRecent: 2.0,
      handicapWeightDecay: 0.85,
      scorecardMode: "required",
      scorecardRequireApproval: false,
      status: "active",
    },
  });

  const season12 = await prisma.season.create({
    data: {
      leagueId: league12.id,
      name: "2026 Season",
      year: 2026,
      seasonNumber: 1,
      isActive: true,
      numberOfWeeks: 6,
    },
  });

  const course12 = await createCourse(
    league12.id,
    "Augusta Replica",
    "Savannah, GA",
    18,
    AUGUSTA_PARS,
    AUGUSTA_YARDS,
    AUGUSTA_HCP,
    "Championship",
    72.5,
    139
  );

  const l12Names = [
    "Champions A",
    "Champions B",
    "Champions C",
    "Champions D",
    "Champions E",
    "Champions F",
    "Champions G",
    "Champions H",
    "Champions I",
    "Champions J",
  ];
  const l12Bases = [76, 78, 80, 74, 82, 79, 77, 84, 75, 81];
  const teams12 = await createTeams(
    league12.id,
    season12.id,
    l12Names,
    l12Bases
  );

  const { matchupIds: l12Matchups } = await createMatchups({
    leagueId: league12.id,
    seasonId: season12.id,
    teams: teams12,
    weeks: 6,
    baseScore: 72,
    multiplier: 0.9,
  });

  // Full scorecards on all 6 weeks for all teams
  const l12Skills: ("elite" | "good" | "average" | "poor")[] = [
    "good",
    "good",
    "average",
    "elite",
    "poor",
    "good",
    "good",
    "poor",
    "elite",
    "average",
  ];

  for (let week = 1; week <= 6; week++) {
    const pairings = roundRobinPairings(
      teams12.map((t) => t.id),
      week
    );
    for (const [aId, bId] of pairings) {
      const aIdx = teams12.findIndex((t) => t.id === aId);
      const bIdx = teams12.findIndex((t) => t.id === bId);
      const matchupKey = `${week}-${aId}-${bId}`;
      const mId = l12Matchups.get(matchupKey);

      await createScorecard({
        leagueId: league12.id,
        courseId: course12.courseId,
        teamId: aId,
        seasonId: season12.id,
        weekNumber: week,
        matchupId: mId,
        teamSide: "A",
        status: "approved",
        playerName: `Player ${l12Names[aIdx]}`,
        holes: course12.holes,
        pars: course12.pars,
        skill: l12Skills[aIdx],
      });
      await createScorecard({
        leagueId: league12.id,
        courseId: course12.courseId,
        teamId: bId,
        seasonId: season12.id,
        weekNumber: week,
        matchupId: mId,
        teamSide: "B",
        status: "approved",
        playerName: `Player ${l12Names[bIdx]}`,
        holes: course12.holes,
        pars: course12.pars,
        skill: l12Skills[bIdx],
      });
    }
  }

  // The bye team each week also gets a scorecard (practice round)
  // With 10 teams (even), there are no byes — all teams are paired each week.
  // So all teams already have scorecards from the pairing loop above.

  console.log(
    "  10 teams, 1 season, 6 weeks, 18-hole, full scorecards all weeks"
  );
  console.log();

  // ════════════════════════════════════════════════════════════════
  // SUMMARY
  // ════════════════════════════════════════════════════════════════

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log("=".repeat(70));
  console.log("  SEED COMPLETE");
  console.log(`  Time: ${elapsed}s`);
  console.log("=".repeat(70));
  console.log();

  console.log("Super Admin:");
  console.log("  URL:      http://localhost:3000/sudo/login");
  console.log("  Username: alex");
  console.log("  Password: sudo123!");
  console.log();

  console.log("All League Admin Credentials:");
  console.log("  Username: admin");
  console.log("  Password: admin123");
  console.log();

  const leagueSummaries = [
    {
      name: "Thursday Night Golf",
      slug: "thursday-night-golf",
      teams: 8,
      seasons: 1,
      weeks: 8,
      features:
        "Match play, 9-hole, scorecards (optional+approval), 1 forfeit, 1 sub, course: Pine Valley",
    },
    {
      name: "Saturday Morning Golf",
      slug: "saturday-morning-golf",
      teams: 6,
      seasons: 1,
      weeks: 5,
      features: "Match play, different handicap (0.8, rounding), no scorecards",
    },
    {
      name: "Sunset Stroke Play League",
      slug: "sunset-stroke-play",
      teams: 10,
      seasons: 1,
      weeks: 10,
      features:
        "Stroke play, weighted points, show/beat bonuses, 3 DNP entries, best 4 of last 8",
    },
    {
      name: "Competitive Match Play",
      slug: "competitive-match-play",
      teams: "8+8",
      seasons: 2,
      weeks: "14+6",
      features:
        "USGA-style, 18-hole, 2 seasons, scorecards required+approval, exceptional cap, provisional, Oakmont",
    },
    {
      name: "Hybrid Scoring League",
      slug: "hybrid-scoring",
      teams: 8,
      seasons: 1,
      weeks: 6,
      features:
        "Hybrid mode (0.6 field weight), both matchups AND weekly scores, no scorecards",
    },
    {
      name: "Beginner Friendly League",
      slug: "beginner-friendly",
      teams: 6,
      seasons: 1,
      weeks: 4,
      features:
        "Forgiving handicap (base 40, 1.1x, ceil, max 36), registration open, Meadow Links course, some scorecards",
    },
    {
      name: "PGA Style League",
      slug: "pga-style",
      teams: 12,
      seasons: 1,
      weeks: 8,
      features:
        "Stroke play, PGA-style preset, pro-rated standings, trend handicap (0.15)",
    },
    {
      name: "Tiny League",
      slug: "tiny-league",
      teams: 4,
      seasons: 1,
      weeks: 12,
      features: "Minimal 4-team league, double round-robin, defaults",
    },
    {
      name: "Big League",
      slug: "big-league",
      teams: 16,
      seasons: 1,
      weeks: 8,
      features:
        "16 teams, playoffs (8 teams, single elim), weighted handicaps, bye avg, 2 forfeits, 1 sub",
    },
    {
      name: "Summer Golf 2026",
      slug: "summer-golf-2026",
      teams: 0,
      seasons: 0,
      weeks: 0,
      features: "Completely empty, registration open, brand new",
    },
    {
      name: "Winter Indoor League",
      slug: "winter-indoor",
      teams: 6,
      seasons: 1,
      weeks: 10,
      features: "Status: SUSPENDED, completed season, registration closed",
    },
    {
      name: "Championship Tour",
      slug: "championship-tour",
      teams: 10,
      seasons: 1,
      weeks: 6,
      features:
        "18-hole, weighted handicaps (2.0/0.85), scorecards required (no approval), Augusta Replica course, full scorecards all weeks",
    },
  ];

  for (let i = 0; i < leagueSummaries.length; i++) {
    const l = leagueSummaries[i];
    console.log(`${String(i + 1).padStart(2)}. ${l.name}`);
    console.log(`    URL:      http://localhost:3000/league/${l.slug}`);
    console.log(`    Admin:    http://localhost:3000/league/${l.slug}/admin/login`);
    console.log(`    Teams: ${l.teams}, Seasons: ${l.seasons}, Weeks: ${l.weeks}`);
    console.log(`    Features: ${l.features}`);
    console.log();
  }

  // Print stats
  const totalLeagues = await prisma.league.count();
  const totalTeams = await prisma.team.count();
  const totalSeasons = await prisma.season.count();
  const totalMatchups = await prisma.matchup.count();
  const totalWeeklyScores = await prisma.weeklyScore.count();
  const totalScorecards = await prisma.scorecard.count();
  const totalHoleScores = await prisma.holeScore.count();
  const totalCourses = await prisma.course.count();
  const totalHoles = await prisma.hole.count();

  console.log("Database Totals:");
  console.log(`  Leagues:       ${totalLeagues}`);
  console.log(`  Seasons:       ${totalSeasons}`);
  console.log(`  Teams:         ${totalTeams}`);
  console.log(`  Matchups:      ${totalMatchups}`);
  console.log(`  Weekly Scores: ${totalWeeklyScores}`);
  console.log(`  Scorecards:    ${totalScorecards}`);
  console.log(`  Hole Scores:   ${totalHoleScores}`);
  console.log(`  Courses:       ${totalCourses}`);
  console.log(`  Holes:         ${totalHoles}`);
  console.log();
  console.log("=".repeat(70));
}

seed()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
