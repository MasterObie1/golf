/**
 * Comprehensive demo seed script for LeagueLinks.
 * Creates 6 leagues with different scoring types, handicap presets,
 * multiple seasons, courses, scorecards, and fun team names.
 *
 * Usage:
 *   npx tsx scripts/seed-demo.ts                    # Local dev.db
 *   TURSO_DATABASE_URL=... TURSO_AUTH_TOKEN=... npx tsx scripts/seed-demo.ts  # Production
 *
 * Pass --force to skip the confirmation prompt for production.
 */

import bcrypt from "bcryptjs";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import * as readline from "readline";

// ============================================
// DATABASE CONNECTION
// ============================================

const dbUrl = process.env.TURSO_DATABASE_URL || process.env.DATABASE_URL || "file:./dev.db";
const tursoToken = process.env.TURSO_AUTH_TOKEN;
const isProduction = !!process.env.TURSO_DATABASE_URL;

const adapter = new PrismaLibSql({
  url: dbUrl,
  authToken: tursoToken || undefined,
});
const prisma = new PrismaClient({ adapter });

// Throttle for production to avoid Turso rate limits
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let queryCount = 0;
async function throttle() {
  queryCount++;
  // Every 50 queries, pause briefly for Turso rate limits
  if (isProduction && queryCount % 50 === 0) {
    await sleep(200);
  }
}

// ============================================
// CONFIRMATION FOR PRODUCTION
// ============================================

async function confirmProduction(): Promise<boolean> {
  if (!isProduction) return true;
  if (process.argv.includes("--force")) return true;

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(
      "\n⚠️  You are about to CLEAR and RESEED a PRODUCTION database.\n" +
        `   URL: ${dbUrl}\n\n` +
        "   Type 'yes' to continue: ",
      (answer) => {
        rl.close();
        resolve(answer.trim().toLowerCase() === "yes");
      }
    );
  });
}

// ============================================
// CLEAR DATABASE
// ============================================

async function clearDatabase() {
  console.log("Clearing all data...");
  // Delete in dependency order
  await prisma.holeScore.deleteMany();
  await prisma.scorecard.deleteMany();
  await prisma.hole.deleteMany();
  await prisma.course.deleteMany();
  await prisma.weeklyScore.deleteMany();
  await prisma.scheduledMatchup.deleteMany();
  await prisma.matchup.deleteMany();
  await prisma.team.deleteMany();
  await prisma.season.deleteMany();
  await prisma.league.deleteMany();
  // Keep SuperAdmin intact
  console.log("  Database cleared (SuperAdmin preserved).\n");
}

// ============================================
// HELPERS
// ============================================

/** Seeded random number generator for reproducibility */
function seededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

/** Generate a realistic 9-hole gross score for a player skill level */
function generateGross(rand: () => number, skill: number): number {
  // skill 0 = scratch (par ~36), skill 10 = high handicapper (~50)
  const base = 36 + skill;
  const variance = Math.floor(rand() * 7) - 3; // -3 to +3
  return Math.max(33, base + variance);
}

/** Generate realistic hole scores for 9 holes */
function generateHoleScores(
  rand: () => number,
  pars: number[],
  skill: number,
  targetGross: number
): number[] {
  const scores = pars.map((par) => {
    const r = rand();
    if (skill <= 2) {
      // Low handicapper: mostly pars, some birdies
      if (r < 0.15) return par - 1; // birdie
      if (r < 0.75) return par;     // par
      if (r < 0.95) return par + 1; // bogey
      return par + 2;               // double
    } else if (skill <= 5) {
      // Mid handicapper
      if (r < 0.05) return par - 1;
      if (r < 0.45) return par;
      if (r < 0.80) return par + 1;
      if (r < 0.95) return par + 2;
      return par + 3;
    } else {
      // High handicapper
      if (r < 0.02) return par - 1;
      if (r < 0.25) return par;
      if (r < 0.55) return par + 1;
      if (r < 0.80) return par + 2;
      if (r < 0.95) return par + 3;
      return par + 4;
    }
  });

  // Adjust to hit target gross
  const currentTotal = scores.reduce((a, b) => a + b, 0);
  let diff = targetGross - currentTotal;
  // Spread the difference across random holes
  while (diff !== 0) {
    const idx = Math.floor(rand() * scores.length);
    if (diff > 0 && scores[idx] < pars[idx] + 4) {
      scores[idx]++;
      diff--;
    } else if (diff < 0 && scores[idx] > pars[idx] - 1) {
      scores[idx]--;
      diff++;
    }
  }
  return scores;
}

// ============================================
// LEAGUE CONFIGURATIONS
// ============================================

interface LeagueConfig {
  name: string;
  slug: string;
  scoringType: "match_play" | "stroke_play" | "hybrid";
  scorecardMode: "disabled" | "optional" | "required";
  maxTeams: number;
  playDay: string;
  playTime: string;
  courseName: string;
  courseLocation: string;
  description: string;
  // Handicap settings (overrides from defaults)
  handicap: {
    baseScore: number;
    multiplier: number;
    rounding: string;
    maxHandicap: number | null;
    scoreSelection: string;
    scoreCount?: number | null;
    bestOf?: number | null;
    lastOf?: number | null;
    dropHighest?: number;
    dropLowest?: number;
    useWeighting?: boolean;
    weightRecent?: number;
    weightDecay?: number;
    capExceptional?: boolean;
    exceptionalCap?: number | null;
    useTrend?: boolean;
    trendWeight?: number;
    provWeeks?: number;
    freezeWeek?: number | null;
  };
  // Stroke play settings
  strokePlay?: {
    pointPreset: string;
    bonusShow: number;
    bonusBeat: number;
    dnpPoints: number;
  };
  // Hybrid settings
  hybrid?: {
    fieldWeight: number;
  };
  course: {
    name: string;
    location: string;
    pars: number[];
    handicapIndexes: number[];
    yardages: number[];
    teeColor: string;
    courseRating?: number;
    slopeRating?: number;
  };
  seasons: SeasonConfig[];
  teamNames: string[];
}

interface SeasonConfig {
  name: string;
  year: number;
  seasonNumber: number;
  isActive: boolean;
  weeks: number;       // completed weeks
  totalWeeks: number;  // total planned weeks
}

const LEAGUES: LeagueConfig[] = [
  // ============================================
  // 1. The Sandbaggers Social Club — Match Play, Simple
  // ============================================
  {
    name: "The Sandbaggers Social Club",
    slug: "sandbaggers-social-club",
    scoringType: "match_play",
    scorecardMode: "optional",
    maxTeams: 8,
    playDay: "Thursday",
    playTime: "5:30 PM",
    courseName: "Whispering Pines Golf Club",
    courseLocation: "Springfield, IL",
    description: "A weekly match-play league where the handicaps are made up and the points don't matter. Just kidding — they definitely matter.",
    handicap: {
      baseScore: 36, multiplier: 0.9, rounding: "floor", maxHandicap: 9,
      scoreSelection: "all",
    },
    course: {
      name: "Whispering Pines Golf Club",
      location: "Springfield, IL",
      pars:            [4, 3, 5, 4, 4, 3, 4, 5, 4],
      handicapIndexes: [3, 7, 1, 5, 9, 8, 2, 4, 6],
      yardages:        [385, 165, 510, 350, 370, 140, 400, 490, 355],
      teeColor: "White",
      courseRating: 35.2,
      slopeRating: 121,
    },
    seasons: [
      { name: "2024 Season", year: 2024, seasonNumber: 1, isActive: false, weeks: 14, totalWeeks: 14 },
      { name: "2025 Season", year: 2025, seasonNumber: 2, isActive: false, weeks: 14, totalWeeks: 14 },
      { name: "2026 Season", year: 2026, seasonNumber: 3, isActive: true, weeks: 5, totalWeeks: 14 },
    ],
    teamNames: [
      "Grip It & Sip It", "Shank Redemption", "Putt Pirates", "The Whiff Wizards",
      "Birdie Sanders", "The Sand Trappers", "Chunk & Run Club", "Noonan Nation",
    ],
  },

  // ============================================
  // 2. Dew Sweepers Dawn Patrol — Stroke Play, USGA-Style
  // ============================================
  {
    name: "Dew Sweepers Dawn Patrol",
    slug: "dew-sweepers",
    scoringType: "stroke_play",
    scorecardMode: "required",
    maxTeams: 10,
    playDay: "Saturday",
    playTime: "6:30 AM",
    courseName: "Eagle's Nest Golf Course",
    courseLocation: "Madison, WI",
    description: "Early birds get the best tee times. Our stroke play league uses USGA-inspired best-of-recent handicapping for competitive fairness.",
    handicap: {
      baseScore: 36, multiplier: 0.96, rounding: "round", maxHandicap: 18,
      scoreSelection: "best_of_last", bestOf: 4, lastOf: 8,
    },
    strokePlay: {
      pointPreset: "pga_style", bonusShow: 1, bonusBeat: 2, dnpPoints: 0,
    },
    course: {
      name: "Eagle's Nest Golf Course",
      location: "Madison, WI",
      pars:            [4, 5, 3, 4, 4, 5, 3, 4, 4],
      handicapIndexes: [2, 4, 8, 1, 6, 3, 9, 5, 7],
      yardages:        [395, 520, 175, 410, 360, 505, 155, 380, 345],
      teeColor: "Blue",
      courseRating: 36.1,
      slopeRating: 128,
    },
    seasons: [
      { name: "Spring 2025", year: 2025, seasonNumber: 1, isActive: false, weeks: 12, totalWeeks: 12 },
      { name: "Spring 2026", year: 2026, seasonNumber: 2, isActive: true, weeks: 7, totalWeeks: 12 },
    ],
    teamNames: [
      "Tee Rex", "Fairway to Heaven", "The Rough Riders", "Par-Tee Animals",
      "Iron Maidens", "The Fore Horsemen", "Double Bogey Bandits", "Wedge Fund Managers",
      "Cart Path Crusaders", "The Gopher Slayers",
    ],
  },

  // ============================================
  // 3. The 19th Hole League — Hybrid, Forgiving
  // ============================================
  {
    name: "The 19th Hole League",
    slug: "the-19th-hole",
    scoringType: "hybrid",
    scorecardMode: "optional",
    maxTeams: 8,
    playDay: "Wednesday",
    playTime: "4:00 PM",
    courseName: "Sunset Ridge Links",
    courseLocation: "Peoria, IL",
    description: "Half match-play drama, half stroke-play grind, fully committed to post-round beverages. Our forgiving handicap system keeps beginners competitive.",
    handicap: {
      baseScore: 36, multiplier: 0.9, rounding: "floor", maxHandicap: 12,
      scoreSelection: "last_n", scoreCount: 5, dropHighest: 1,
    },
    hybrid: { fieldWeight: 0.5 },
    course: {
      name: "Sunset Ridge Links",
      location: "Peoria, IL",
      pars:            [4, 4, 3, 5, 4, 3, 4, 5, 4],
      handicapIndexes: [1, 5, 7, 3, 2, 9, 6, 4, 8],
      yardages:        [370, 340, 150, 495, 385, 130, 365, 480, 350],
      teeColor: "White",
      courseRating: 34.8,
      slopeRating: 118,
    },
    seasons: [
      { name: "Summer 2025", year: 2025, seasonNumber: 1, isActive: false, weeks: 10, totalWeeks: 10 },
      { name: "Summer 2026", year: 2026, seasonNumber: 2, isActive: true, weeks: 4, totalWeeks: 10 },
    ],
    teamNames: [
      "Hole-in-None", "Club Sandwich", "The Water Hazards", "Eagles Anonymous",
      "Hook Line & Sinker", "The Yips Society", "Putter Nutters", "Slice Girls",
    ],
  },

  // ============================================
  // 4. Ace Ventura Golf Society — Match Play, Competitive
  // ============================================
  {
    name: "Ace Ventura Golf Society",
    slug: "ace-ventura-golf",
    scoringType: "match_play",
    scorecardMode: "disabled",
    maxTeams: 8,
    playDay: "Tuesday",
    playTime: "5:00 PM",
    courseName: "Shadow Creek Country Club",
    courseLocation: "Columbus, OH",
    description: "Alrighty then! A competitive match-play league with recency-weighted handicaps. Recent form matters more than ancient history.",
    handicap: {
      baseScore: 36, multiplier: 0.9, rounding: "floor", maxHandicap: 9,
      scoreSelection: "all",
      useWeighting: true, weightRecent: 1.3, weightDecay: 0.95,
    },
    course: {
      name: "Shadow Creek Country Club",
      location: "Columbus, OH",
      pars:            [4, 3, 4, 5, 4, 4, 3, 5, 4],
      handicapIndexes: [4, 8, 1, 3, 6, 2, 9, 5, 7],
      yardages:        [400, 180, 420, 530, 365, 405, 160, 500, 375],
      teeColor: "Blue",
      courseRating: 36.4,
      slopeRating: 130,
    },
    seasons: [
      { name: "Fall 2024", year: 2024, seasonNumber: 1, isActive: false, weeks: 12, totalWeeks: 12 },
      { name: "Fall 2025", year: 2025, seasonNumber: 2, isActive: false, weeks: 12, totalWeeks: 12 },
      { name: "Spring 2026", year: 2026, seasonNumber: 3, isActive: true, weeks: 6, totalWeeks: 12 },
    ],
    teamNames: [
      "The Divot Diggers", "OB City Slickers", "The Fade Factory", "Tin Cup Heroes",
      "Happy Gilmore's", "Caddy Shack Attack", "The Dimple Dancers", "Albatross Achievers",
    ],
  },

  // ============================================
  // 5. Shanks But No Shanks — Stroke Play, Strict
  // ============================================
  {
    name: "Shanks But No Shanks",
    slug: "shanks-but-no-shanks",
    scoringType: "stroke_play",
    scorecardMode: "required",
    maxTeams: 12,
    playDay: "Friday",
    playTime: "3:00 PM",
    courseName: "Cedar Valley Golf Club",
    courseLocation: "Des Moines, IA",
    description: "A no-nonsense stroke play league with strict anti-sandbagging measures. Trend-adjusted handicaps and exceptional score caps keep it honest.",
    handicap: {
      baseScore: 36, multiplier: 0.9, rounding: "floor", maxHandicap: 18,
      scoreSelection: "all",
      capExceptional: true, exceptionalCap: 50,
      useTrend: true, trendWeight: 0.15,
    },
    strokePlay: {
      pointPreset: "linear", bonusShow: 0, bonusBeat: 1, dnpPoints: 0,
    },
    course: {
      name: "Cedar Valley Golf Club",
      location: "Des Moines, IA",
      pars:            [5, 4, 3, 4, 4, 3, 5, 4, 4],
      handicapIndexes: [3, 1, 7, 5, 2, 9, 4, 6, 8],
      yardages:        [515, 410, 170, 375, 390, 145, 500, 365, 350],
      teeColor: "White",
      courseRating: 35.5,
      slopeRating: 124,
    },
    seasons: [
      { name: "2026 Season", year: 2026, seasonNumber: 1, isActive: true, weeks: 8, totalWeeks: 16 },
    ],
    teamNames: [
      "The Bogey Bunch", "Chip Happens", "The Duff Stuff", "The Mulliganders",
      "Tree Finders United", "The Chili Dippers", "Worm Burner Express", "Skull Squadron",
      "The Lip Out Crew", "Top Spin City", "Flop Shot Mafia", "The Plugged Lies",
    ],
  },

  // ============================================
  // 6. Full Send Fairway Club — Match Play, Custom (Provisional + Freeze)
  // ============================================
  {
    name: "Full Send Fairway Club",
    slug: "full-send-fairway",
    scoringType: "match_play",
    scorecardMode: "optional",
    maxTeams: 6,
    playDay: "Sunday",
    playTime: "8:00 AM",
    courseName: "Pine Hollow Country Club",
    courseLocation: "Naperville, IL",
    description: "A custom-tuned match-play league with provisional weeks for newcomers and a late-season handicap freeze. Maximum send energy.",
    handicap: {
      baseScore: 35, multiplier: 0.85, rounding: "round", maxHandicap: 10,
      scoreSelection: "last_n", scoreCount: 6,
      provWeeks: 3, freezeWeek: 10,
    },
    course: {
      name: "Pine Hollow Country Club",
      location: "Naperville, IL",
      pars:            [4, 3, 4, 5, 3, 4, 4, 5, 4],
      handicapIndexes: [2, 6, 1, 4, 8, 3, 7, 5, 9],
      yardages:        [375, 155, 395, 505, 140, 380, 345, 485, 360],
      teeColor: "Gold",
      courseRating: 35.0,
      slopeRating: 119,
    },
    seasons: [
      { name: "2024 Season", year: 2024, seasonNumber: 1, isActive: false, weeks: 12, totalWeeks: 12 },
      { name: "2025 Season", year: 2025, seasonNumber: 2, isActive: false, weeks: 12, totalWeeks: 12 },
      { name: "2026 Season", year: 2026, seasonNumber: 3, isActive: true, weeks: 4, totalWeeks: 12 },
    ],
    teamNames: [
      "The Fore Caddies", "Bogey Nights", "Send It Steve's", "The Lag Putters",
      "Hosel Rockets", "The Dew Collectors",
    ],
  },
];

// ============================================
// PLAYER NAMES
// ============================================

const PLAYER_NAMES = [
  "Mike Johnson", "Dave Williams", "Tom Anderson", "Chris Martinez", "Steve Thompson",
  "Jim Garcia", "Bob Rodriguez", "Rick Wilson", "Dan Moore", "Paul Taylor",
  "Mark Thomas", "Jeff Jackson", "Kevin White", "Brian Harris", "Scott Martin",
  "Gary Lee", "Tim Walker", "Larry Hall", "Joe Allen", "Ed Young",
  "Sam King", "Pete Wright", "Bill Lopez", "Ron Hill", "Frank Scott",
  "Ray Green", "Don Adams", "Ken Baker", "Greg Nelson", "Carl Carter",
  "Phil Mitchell", "Bruce Perez", "Wayne Roberts", "Dale Turner", "Earl Phillips",
  "Fred Campbell", "Hank Parker", "Lou Evans", "Mel Edwards", "Norm Collins",
];

// ============================================
// SEED FUNCTIONS
// ============================================

async function seedLeague(config: LeagueConfig, leagueIndex: number) {
  const rand = seededRandom(leagueIndex * 1000 + 42);
  const hashedPassword = await bcrypt.hash("demo123", 12);

  console.log(`\n${"=".repeat(50)}`);
  console.log(`Creating: ${config.name}`);
  console.log(`  Type: ${config.scoringType} | Handicap: ${config.handicap.scoreSelection}`);
  console.log(`${"=".repeat(50)}`);

  // Create league
  const league = await prisma.league.create({
    data: {
      name: config.name,
      slug: config.slug,
      adminUsername: `admin@${config.slug}`,
      adminPassword: hashedPassword,
      maxTeams: config.maxTeams,
      registrationOpen: true,
      scoringType: config.scoringType,
      scorecardMode: config.scorecardMode,
      scorecardRequireApproval: false,
      playDay: config.playDay,
      playTime: config.playTime,
      courseName: config.courseName,
      courseLocation: config.courseLocation,
      description: config.description,
      // Handicap
      handicapBaseScore: config.handicap.baseScore,
      handicapMultiplier: config.handicap.multiplier,
      handicapRounding: config.handicap.rounding,
      handicapMax: config.handicap.maxHandicap,
      handicapScoreSelection: config.handicap.scoreSelection,
      handicapScoreCount: config.handicap.scoreCount ?? null,
      handicapBestOf: config.handicap.bestOf ?? null,
      handicapLastOf: config.handicap.lastOf ?? null,
      handicapDropHighest: config.handicap.dropHighest ?? 0,
      handicapDropLowest: config.handicap.dropLowest ?? 0,
      handicapUseWeighting: config.handicap.useWeighting ?? false,
      handicapWeightRecent: config.handicap.weightRecent ?? 1.5,
      handicapWeightDecay: config.handicap.weightDecay ?? 0.9,
      handicapCapExceptional: config.handicap.capExceptional ?? false,
      handicapExceptionalCap: config.handicap.exceptionalCap ?? null,
      handicapUseTrend: config.handicap.useTrend ?? false,
      handicapTrendWeight: config.handicap.trendWeight ?? 0.1,
      handicapProvWeeks: config.handicap.provWeeks ?? 0,
      handicapFreezeWeek: config.handicap.freezeWeek ?? null,
      // Stroke play
      strokePlayPointPreset: config.strokePlay?.pointPreset ?? "linear",
      strokePlayBonusShow: config.strokePlay?.bonusShow ?? 0,
      strokePlayBonusBeat: config.strokePlay?.bonusBeat ?? 0,
      strokePlayDnpPoints: config.strokePlay?.dnpPoints ?? 0,
      // Hybrid
      hybridFieldWeight: config.hybrid?.fieldWeight ?? 0.5,
      // Schedule
      scheduleType: "single_round_robin",
      byePointsMode: "flat",
      byePointsFlat: 10,
    },
  });
  console.log(`  League created (id: ${league.id})`);

  // Create course
  const course = await prisma.course.create({
    data: {
      leagueId: league.id,
      name: config.course.name,
      location: config.course.location,
      numberOfHoles: config.course.pars.length,
      totalPar: config.course.pars.reduce((a, b) => a + b, 0),
      teeColor: config.course.teeColor,
      courseRating: config.course.courseRating ?? null,
      slopeRating: config.course.slopeRating ?? null,
      isActive: true,
    },
  });

  // Create holes
  const holes: { id: number; holeNumber: number; par: number }[] = [];
  for (let i = 0; i < config.course.pars.length; i++) {
    const hole = await prisma.hole.create({
      data: {
        courseId: course.id,
        holeNumber: i + 1,
        par: config.course.pars[i],
        handicapIndex: config.course.handicapIndexes[i],
        yardage: config.course.yardages[i],
      },
    });
    holes.push({ id: hole.id, holeNumber: i + 1, par: config.course.pars[i] });
  }
  console.log(`  Course: ${course.name} (${holes.length} holes, par ${config.course.pars.reduce((a, b) => a + b, 0)})`);

  // Assign skills to teams (consistent per team name)
  const teamSkills: Record<string, number> = {};
  config.teamNames.forEach((name, i) => {
    // Spread skills: some good (1-3), some mid (4-6), some high (7-9)
    teamSkills[name] = 1 + Math.floor((i / config.teamNames.length) * 9);
  });

  // Create seasons with teams and data
  for (const seasonConfig of config.seasons) {
    const season = await prisma.season.create({
      data: {
        leagueId: league.id,
        name: seasonConfig.name,
        year: seasonConfig.year,
        seasonNumber: seasonConfig.seasonNumber,
        isActive: seasonConfig.isActive,
        numberOfWeeks: seasonConfig.totalWeeks,
        scoringType: config.scoringType,
      },
    });
    console.log(`  Season: ${season.name} (${seasonConfig.weeks}/${seasonConfig.totalWeeks} weeks${seasonConfig.isActive ? " - ACTIVE" : ""})`);

    // Create teams for this season
    const teams: { id: number; name: string; skill: number }[] = [];
    for (let i = 0; i < config.teamNames.length; i++) {
      const teamName = config.teamNames[i];
      const playerIdx = (leagueIndex * 8 + i) % PLAYER_NAMES.length;
      const team = await prisma.team.create({
        data: {
          name: teamName,
          leagueId: league.id,
          seasonId: season.id,
          captainName: PLAYER_NAMES[playerIdx],
          email: `${teamName.toLowerCase().replace(/[^a-z0-9]/g, "")}@demo.golf`,
          status: "approved",
        },
      });
      teams.push({ id: team.id, name: teamName, skill: teamSkills[teamName] });
    }

    // Generate match data based on scoring type
    if (config.scoringType === "match_play") {
      await generateMatchPlaySeason(rand, league.id, season.id, course.id, teams, holes, seasonConfig.weeks, config);
    } else if (config.scoringType === "stroke_play") {
      await generateStrokePlaySeason(rand, league.id, season.id, course.id, teams, holes, seasonConfig.weeks, config);
    } else {
      // Hybrid: generate both matchups and weekly scores
      await generateHybridSeason(rand, league.id, season.id, course.id, teams, holes, seasonConfig.weeks, config);
    }
  }
}

// ============================================
// MATCH PLAY GENERATION
// ============================================

async function generateMatchPlaySeason(
  rand: () => number,
  leagueId: number,
  seasonId: number,
  courseId: number,
  teams: { id: number; name: string; skill: number }[],
  holes: { id: number; holeNumber: number; par: number }[],
  weeks: number,
  config: LeagueConfig
) {
  const pars = holes.map((h) => h.par);
  let matchCount = 0;
  let scorecardCount = 0;

  for (let week = 1; week <= weeks; week++) {
    // Round-robin pairing
    const pairings = createWeeklyPairings(teams, week);

    for (const [teamA, teamB] of pairings) {
      if (!teamB) continue; // bye

      const grossA = generateGross(rand, teamA.skill);
      const grossB = generateGross(rand, teamB.skill);
      const handicapA = Math.max(0, Math.floor((teamA.skill * 3 - 2 + (rand() * 4 - 2)) * config.handicap.multiplier));
      const handicapB = Math.max(0, Math.floor((teamB.skill * 3 - 2 + (rand() * 4 - 2)) * config.handicap.multiplier));
      const netA = grossA - handicapA;
      const netB = grossB - handicapB;

      let pointsA: number, pointsB: number;
      if (netA < netB) {
        pointsA = 12 + Math.floor(rand() * 4);
        pointsB = 20 - pointsA;
      } else if (netB < netA) {
        pointsB = 12 + Math.floor(rand() * 4);
        pointsA = 20 - pointsB;
      } else {
        pointsA = 10;
        pointsB = 10;
      }

      await throttle();
      const matchup = await prisma.matchup.create({
        data: {
          leagueId, seasonId, weekNumber: week,
          teamAId: teamA.id, teamBId: teamB.id,
          teamAGross: grossA, teamBGross: grossB,
          teamAHandicap: handicapA, teamBHandicap: handicapB,
          teamANet: netA, teamBNet: netB,
          teamAPoints: pointsA, teamBPoints: pointsB,
        },
      });
      matchCount++;

      // Update team stats
      await updateTeamStats(teamA.id, pointsA, pointsB);
      await updateTeamStats(teamB.id, pointsB, pointsA);

      // Generate scorecards if enabled
      if (config.scorecardMode !== "disabled") {
        for (const [team, gross, side] of [[teamA, grossA, "A"], [teamB, grossB, "B"]] as const) {
          const holeScores = generateHoleScores(rand, pars, team.skill, gross);
          const playerIdx = Math.floor(rand() * PLAYER_NAMES.length);
          await createScorecard(
            leagueId, seasonId, courseId, team.id, week,
            matchup.id, side, gross, holeScores, holes,
            PLAYER_NAMES[playerIdx]
          );
          scorecardCount++;
        }
      }
    }
  }
  console.log(`    ${matchCount} matchups${scorecardCount > 0 ? `, ${scorecardCount} scorecards` : ""}`);
}

// ============================================
// STROKE PLAY GENERATION
// ============================================

async function generateStrokePlaySeason(
  rand: () => number,
  leagueId: number,
  seasonId: number,
  courseId: number,
  teams: { id: number; name: string; skill: number }[],
  holes: { id: number; holeNumber: number; par: number }[],
  weeks: number,
  config: LeagueConfig
) {
  const pars = holes.map((h) => h.par);
  let scoreCount = 0;
  let scorecardCount = 0;

  // Point scales by preset
  const pointScales: Record<string, number[]> = {
    linear: [10, 9, 8, 7, 6, 5, 4, 3, 2, 1],
    pga_style: [15, 12, 10, 8, 6, 5, 4, 3, 2, 1],
    weighted: [12, 10, 8, 6, 5, 4, 3, 2, 1, 1],
  };
  const preset = config.strokePlay?.pointPreset ?? "linear";
  const scale = pointScales[preset] || pointScales.linear;

  for (let week = 1; week <= weeks; week++) {
    // All teams play each week (some may DNP)
    const weekScores: { teamId: number; team: typeof teams[0]; gross: number; handicap: number; net: number; isDnp: boolean }[] = [];

    for (const team of teams) {
      const isDnp = rand() < 0.08; // 8% chance of DNP
      if (isDnp) {
        weekScores.push({ teamId: team.id, team, gross: 0, handicap: 0, net: 0, isDnp: true });
      } else {
        const gross = generateGross(rand, team.skill);
        const handicap = Math.max(0, Math.floor((team.skill * 3 - 2 + (rand() * 4 - 2)) * config.handicap.multiplier));
        const net = gross - handicap;
        weekScores.push({ teamId: team.id, team, gross, handicap, net, isDnp: false });
      }
    }

    // Sort by net score (lower is better), DNPs last
    const sorted = [...weekScores].sort((a, b) => {
      if (a.isDnp && !b.isDnp) return 1;
      if (!a.isDnp && b.isDnp) return -1;
      if (a.isDnp && b.isDnp) return 0;
      return a.net - b.net;
    });

    // Assign positions and points
    for (let i = 0; i < sorted.length; i++) {
      const entry = sorted[i];
      const position = entry.isDnp ? sorted.length : i + 1;
      const points = entry.isDnp
        ? (config.strokePlay?.dnpPoints ?? 0)
        : (scale[Math.min(i, scale.length - 1)] + (config.strokePlay?.bonusShow ?? 0));

      await throttle();
      await prisma.weeklyScore.create({
        data: {
          leagueId, seasonId, weekNumber: week,
          teamId: entry.teamId,
          grossScore: entry.isDnp ? 0 : entry.gross,
          handicap: entry.handicap,
          netScore: entry.isDnp ? 0 : entry.net,
          points,
          position,
          isDnp: entry.isDnp,
        },
      });
      scoreCount++;

      // Update team total points
      await prisma.team.update({
        where: { id: entry.teamId },
        data: { totalPoints: { increment: points } },
      });

      // Create scorecards for non-DNP if enabled
      if (!entry.isDnp && config.scorecardMode !== "disabled") {
        const holeScores = generateHoleScores(rand, pars, entry.team.skill, entry.gross);
        const playerIdx = Math.floor(rand() * PLAYER_NAMES.length);
        await createScorecard(
          leagueId, seasonId, courseId, entry.teamId, week,
          null, null, entry.gross, holeScores, holes,
          PLAYER_NAMES[playerIdx]
        );
        scorecardCount++;
      }
    }
  }
  console.log(`    ${scoreCount} weekly scores${scorecardCount > 0 ? `, ${scorecardCount} scorecards` : ""}`);
}

// ============================================
// HYBRID GENERATION
// ============================================

async function generateHybridSeason(
  rand: () => number,
  leagueId: number,
  seasonId: number,
  courseId: number,
  teams: { id: number; name: string; skill: number }[],
  holes: { id: number; holeNumber: number; par: number }[],
  weeks: number,
  config: LeagueConfig
) {
  const pars = holes.map((h) => h.par);
  let matchCount = 0;
  let scoreCount = 0;
  let scorecardCount = 0;

  for (let week = 1; week <= weeks; week++) {
    // Match play pairings
    const pairings = createWeeklyPairings(teams, week);

    // Track all scores for field points
    const weekGrosses: { teamId: number; team: typeof teams[0]; gross: number; handicap: number; net: number }[] = [];

    for (const [teamA, teamB] of pairings) {
      if (!teamB) continue;

      const grossA = generateGross(rand, teamA.skill);
      const grossB = generateGross(rand, teamB.skill);
      const handicapA = Math.max(0, Math.floor((teamA.skill * 3 - 2 + (rand() * 4 - 2)) * config.handicap.multiplier));
      const handicapB = Math.max(0, Math.floor((teamB.skill * 3 - 2 + (rand() * 4 - 2)) * config.handicap.multiplier));
      const netA = grossA - handicapA;
      const netB = grossB - handicapB;

      let pointsA: number, pointsB: number;
      if (netA < netB) {
        pointsA = 12 + Math.floor(rand() * 4);
        pointsB = 20 - pointsA;
      } else if (netB < netA) {
        pointsB = 12 + Math.floor(rand() * 4);
        pointsA = 20 - pointsB;
      } else {
        pointsA = 10; pointsB = 10;
      }

      await throttle();
      const matchup = await prisma.matchup.create({
        data: {
          leagueId, seasonId, weekNumber: week,
          teamAId: teamA.id, teamBId: teamB.id,
          teamAGross: grossA, teamBGross: grossB,
          teamAHandicap: handicapA, teamBHandicap: handicapB,
          teamANet: netA, teamBNet: netB,
          teamAPoints: pointsA, teamBPoints: pointsB,
        },
      });
      matchCount++;

      await updateTeamStats(teamA.id, pointsA, pointsB);
      await updateTeamStats(teamB.id, pointsB, pointsA);

      weekGrosses.push({ teamId: teamA.id, team: teamA, gross: grossA, handicap: handicapA, net: netA });
      weekGrosses.push({ teamId: teamB.id, team: teamB, gross: grossB, handicap: handicapB, net: netB });

      // Scorecards
      if (config.scorecardMode !== "disabled") {
        for (const [team, gross, side] of [[teamA, grossA, "A"], [teamB, grossB, "B"]] as const) {
          const holeScores = generateHoleScores(rand, pars, team.skill, gross);
          const playerIdx = Math.floor(rand() * PLAYER_NAMES.length);
          await createScorecard(
            leagueId, seasonId, courseId, team.id, week,
            matchup.id, side, gross, holeScores, holes,
            PLAYER_NAMES[playerIdx]
          );
          scorecardCount++;
        }
      }
    }

    // Also create weekly scores for field ranking (hybrid mode)
    const sorted = [...weekGrosses].sort((a, b) => a.net - b.net);
    const scale = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1];
    for (let i = 0; i < sorted.length; i++) {
      const entry = sorted[i];
      const points = scale[Math.min(i, scale.length - 1)];
      await throttle();
      await prisma.weeklyScore.create({
        data: {
          leagueId, seasonId, weekNumber: week,
          teamId: entry.teamId,
          grossScore: entry.gross,
          handicap: entry.handicap,
          netScore: entry.net,
          points,
          position: i + 1,
        },
      });
      scoreCount++;
    }
  }
  console.log(`    ${matchCount} matchups, ${scoreCount} weekly scores${scorecardCount > 0 ? `, ${scorecardCount} scorecards` : ""}`);
}

// ============================================
// SHARED HELPERS
// ============================================

function createWeeklyPairings<T>(teams: T[], week: number): [T, T | null][] {
  // Circle method for round-robin scheduling
  const n = teams.length;
  const fixed = teams[0];
  const rotating = teams.slice(1);
  const rotated = [...rotating];

  // Rotate for this week
  for (let i = 0; i < (week - 1) % (n - 1); i++) {
    rotated.unshift(rotated.pop()!);
  }

  const pairings: [T, T | null][] = [];
  pairings.push([fixed, rotated[0]]);
  for (let i = 1; i < Math.floor(n / 2); i++) {
    pairings.push([rotated[i], rotated[rotated.length - i]]);
  }

  // If odd number of teams, last team gets a bye
  if (n % 2 === 1) {
    pairings.push([rotated[Math.floor(n / 2)], null]);
  }

  return pairings;
}

async function updateTeamStats(teamId: number, myPoints: number, oppPoints: number) {
  const won = myPoints > oppPoints;
  const lost = myPoints < oppPoints;
  const tied = myPoints === oppPoints;
  await prisma.team.update({
    where: { id: teamId },
    data: {
      totalPoints: { increment: myPoints },
      wins: { increment: won ? 1 : 0 },
      losses: { increment: lost ? 1 : 0 },
      ties: { increment: tied ? 1 : 0 },
    },
  });
}

async function createScorecard(
  leagueId: number,
  seasonId: number,
  courseId: number,
  teamId: number,
  weekNumber: number,
  matchupId: number | null,
  teamSide: "A" | "B" | null,
  grossTotal: number,
  holeScores: number[],
  holes: { id: number; holeNumber: number; par: number }[],
  playerName: string
) {
  const frontNine = holeScores.slice(0, Math.min(holeScores.length, 9)).reduce((a, b) => a + b, 0);

  await throttle();
  const scorecard = await prisma.scorecard.create({
    data: {
      leagueId,
      courseId,
      teamId,
      seasonId,
      weekNumber,
      matchupId,
      teamSide,
      grossTotal,
      frontNine,
      status: "approved",
      playerName,
      completedAt: new Date(),
      approvedAt: new Date(),
    },
  });

  // Create hole scores in batch via createMany for fewer round-trips
  await throttle();
  await prisma.holeScore.createMany({
    data: holeScores.map((strokes, i) => ({
      scorecardId: scorecard.id,
      holeId: holes[i].id,
      holeNumber: i + 1,
      strokes,
    })),
  });
}

// ============================================
// MAIN
// ============================================

async function main() {
  console.log("LeagueLinks Demo Seed Script");
  console.log(`Database: ${isProduction ? "PRODUCTION (Turso)" : "Local"}`);
  console.log(`URL: ${dbUrl}\n`);

  const confirmed = await confirmProduction();
  if (!confirmed) {
    console.log("Aborted.");
    process.exit(0);
  }

  await clearDatabase();

  // Re-seed superadmin
  const superAdminPassword = process.env.SUPER_ADMIN_PASSWORD || "demo12345";
  const existingSuperAdmin = await prisma.superAdmin.findFirst();
  if (!existingSuperAdmin) {
    await prisma.superAdmin.create({
      data: {
        username: "admin",
        password: await bcrypt.hash(superAdminPassword, 12),
      },
    });
    console.log(`SuperAdmin created (admin / ${superAdminPassword})`);
  } else {
    console.log(`SuperAdmin preserved (${existingSuperAdmin.username})`);
  }

  // Create all leagues
  for (let i = 0; i < LEAGUES.length; i++) {
    await seedLeague(LEAGUES[i], i);
  }

  // Print summary
  const leagueCount = await prisma.league.count();
  const seasonCount = await prisma.season.count();
  const teamCount = await prisma.team.count();
  const matchupCount = await prisma.matchup.count();
  const weeklyScoreCount = await prisma.weeklyScore.count();
  const scorecardCount = await prisma.scorecard.count();
  const holeScoreCount = await prisma.holeScore.count();
  const courseCount = await prisma.course.count();

  console.log(`\n${"=".repeat(50)}`);
  console.log("SEED COMPLETE");
  console.log(`${"=".repeat(50)}`);
  console.log(`  Leagues:       ${leagueCount}`);
  console.log(`  Seasons:       ${seasonCount}`);
  console.log(`  Teams:         ${teamCount}`);
  console.log(`  Courses:       ${courseCount}`);
  console.log(`  Matchups:      ${matchupCount}`);
  console.log(`  Weekly Scores: ${weeklyScoreCount}`);
  console.log(`  Scorecards:    ${scorecardCount}`);
  console.log(`  Hole Scores:   ${holeScoreCount}`);

  console.log(`\nAll league admin password: demo123`);
  console.log(`Admin usernames: admin@{slug}\n`);

  for (const l of LEAGUES) {
    console.log(`  ${l.name}`);
    console.log(`    URL:   /league/${l.slug}`);
    console.log(`    Admin: admin@${l.slug} / demo123`);
  }
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
