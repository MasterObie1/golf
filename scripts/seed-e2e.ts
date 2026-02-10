// E2E seed script — "Alex's League"
// Creates a fully populated league for Playwright E2E tests
// Run with: npx tsx scripts/seed-e2e.ts

if (process.env.NODE_ENV === "production") {
  console.error("ERROR: Seed scripts must not run in production. Aborting.");
  process.exit(1);
}

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import * as bcrypt from "bcryptjs";
import {
  calculateHandicap,
  calculateNetScore,
  suggestPoints,
  type HandicapSettings,
  DEFAULT_HANDICAP_SETTINGS,
} from "../src/lib/handicap";

const tursoUrl = process.env.TURSO_DATABASE_URL;
const tursoToken = process.env.TURSO_AUTH_TOKEN;
const dbUrl = tursoUrl || process.env.DATABASE_URL || "file:./dev.db";

const adapter = new PrismaLibSql({
  url: dbUrl,
  authToken: tursoUrl ? tursoToken : undefined,
});
const prisma = new PrismaClient({ adapter });

// ============================================
// League settings
// ============================================

const LEAGUE_NAME = "Alex's League";
const LEAGUE_SLUG = "alexs-league";
const LEAGUE_PASSWORD = "alexleague123";
const NUM_WEEKS = 10;

const HANDICAP_SETTINGS: HandicapSettings = {
  ...DEFAULT_HANDICAP_SETTINGS,
  baseScore: 35,
  multiplier: 0.9,
  maxHandicap: 9,
  rounding: "floor",
};

// ============================================
// 18 teams with skill tiers
// ============================================

type SkillTier = "elite" | "good" | "average" | "below_average" | "poor" | "struggling";

interface TeamDef {
  name: string;
  captain: string;
  email: string;
  phone: string;
  skill: SkillTier;
}

const TEAMS: TeamDef[] = [
  // Elite (2 teams)
  { name: "The Aces", captain: "Alex Thompson", email: "alex.t@email.com", phone: "(555) 100-0001", skill: "elite" },
  { name: "Eagle Squadron", captain: "Ben Carter", email: "ben.c@email.com", phone: "(555) 100-0002", skill: "elite" },
  // Good (3 teams)
  { name: "Birdie Bunch", captain: "Chris Davis", email: "chris.d@email.com", phone: "(555) 100-0003", skill: "good" },
  { name: "Fairway Legends", captain: "Dan Evans", email: "dan.e@email.com", phone: "(555) 100-0004", skill: "good" },
  { name: "Par Patrol", captain: "Ethan Fox", email: "ethan.f@email.com", phone: "(555) 100-0005", skill: "good" },
  // Average (5 teams)
  { name: "Green Machine", captain: "Frank Green", email: "frank.g@email.com", phone: "(555) 100-0006", skill: "average" },
  { name: "Divot Diggers", captain: "Gary Hill", email: "gary.h@email.com", phone: "(555) 100-0007", skill: "average" },
  { name: "Putt Pirates", captain: "Henry Irwin", email: "henry.i@email.com", phone: "(555) 100-0008", skill: "average" },
  { name: "Tee Time Titans", captain: "Ian James", email: "ian.j@email.com", phone: "(555) 100-0009", skill: "average" },
  { name: "Cart Path Cruisers", captain: "Jack King", email: "jack.k@email.com", phone: "(555) 100-0010", skill: "average" },
  // Below average (4 teams)
  { name: "Slice & Dice", captain: "Kyle Long", email: "kyle.l@email.com", phone: "(555) 100-0011", skill: "below_average" },
  { name: "Bunker Busters", captain: "Liam Moore", email: "liam.m@email.com", phone: "(555) 100-0012", skill: "below_average" },
  { name: "Sand Trappers", captain: "Mike Nolan", email: "mike.n@email.com", phone: "(555) 100-0013", skill: "below_average" },
  { name: "Mulligan Masters", captain: "Nick Owen", email: "nick.o@email.com", phone: "(555) 100-0014", skill: "below_average" },
  // Poor (2 teams)
  { name: "Rough Riders", captain: "Oliver Park", email: "oliver.p@email.com", phone: "(555) 100-0015", skill: "poor" },
  { name: "Water Hazards", captain: "Pete Quinn", email: "pete.q@email.com", phone: "(555) 100-0016", skill: "poor" },
  // Struggling (2 teams)
  { name: "The Bogey Boys", captain: "Ryan Smith", email: "ryan.s@email.com", phone: "(555) 100-0017", skill: "struggling" },
  { name: "Double Bogeys", captain: "Sam Turner", email: "sam.t@email.com", phone: "(555) 100-0018", skill: "struggling" },
];

// ============================================
// Score generation by skill tier
// ============================================

// Use a seeded random for reproducible results
let seedValue = 42;
function seededRandom(): number {
  seedValue = (seedValue * 16807 + 0) % 2147483647;
  return (seedValue - 1) / 2147483646;
}

function generateGrossScore(skill: SkillTier): number {
  const r = seededRandom();
  switch (skill) {
    case "elite":       return 33 + Math.floor(r * 5);  // 33-37
    case "good":        return 37 + Math.floor(r * 5);  // 37-41
    case "average":     return 41 + Math.floor(r * 5);  // 41-45
    case "below_average": return 44 + Math.floor(r * 5); // 44-48
    case "poor":        return 47 + Math.floor(r * 5);  // 47-51
    case "struggling":  return 50 + Math.floor(r * 5);  // 50-54
  }
}

function getInitialHandicap(skill: SkillTier): number {
  switch (skill) {
    case "elite":         return 0;
    case "good":          return 2;
    case "average":       return 4;
    case "below_average": return 6;
    case "poor":          return 7;
    case "struggling":    return 9;
  }
}

// ============================================
// Round-robin schedule for 18 teams
// ============================================

function generateWeekPairings(teamIds: number[], weekNum: number): [number, number][] {
  // Standard round-robin: fix first team, rotate the rest
  const rotated = [...teamIds];
  for (let i = 0; i < (weekNum - 1) % (teamIds.length - 1); i++) {
    const last = rotated.pop()!;
    rotated.splice(1, 0, last);
  }

  const pairs: [number, number][] = [];
  const half = Math.floor(teamIds.length / 2);
  for (let i = 0; i < half; i++) {
    pairs.push([rotated[i], rotated[teamIds.length - 1 - i]]);
  }
  return pairs;
}

// ============================================
// Main seed function
// ============================================

async function seed() {
  console.log("Seeding E2E data: Alex's League\n");

  // Idempotent: delete existing data for this league (check both slug variants)
  const slugsToCheck = [LEAGUE_SLUG, "alex-s-league", "alexs-league-1"];
  for (const slug of slugsToCheck) {
    const existing = await prisma.league.findUnique({
      where: { slug },
      select: { id: true },
    });
    if (existing) {
      console.log(`  Removing existing league (slug: ${slug})...`);
      await prisma.matchup.deleteMany({ where: { leagueId: existing.id } });
      await prisma.team.deleteMany({ where: { leagueId: existing.id } });
      await prisma.season.deleteMany({ where: { leagueId: existing.id } });
      await prisma.league.delete({ where: { id: existing.id } });
      console.log("  Cleared.");
    }
  }
  // Also check by name
  const byName = await prisma.league.findFirst({
    where: { name: { in: [LEAGUE_NAME, "Alexs League"] } },
    select: { id: true, slug: true },
  });
  if (byName) {
    console.log(`  Removing existing league by name (slug: ${byName.slug})...`);
    await prisma.matchup.deleteMany({ where: { leagueId: byName.id } });
    await prisma.team.deleteMany({ where: { leagueId: byName.id } });
    await prisma.season.deleteMany({ where: { leagueId: byName.id } });
    await prisma.league.delete({ where: { id: byName.id } });
    console.log("  Cleared.");
  }
  console.log();

  // Create league
  const hashedPassword = await bcrypt.hash(LEAGUE_PASSWORD, 12);
  const league = await prisma.league.create({
    data: {
      name: LEAGUE_NAME,
      slug: LEAGUE_SLUG,
      adminUsername: `admin@Alex'sLeague`,
      adminPassword: hashedPassword,
      maxTeams: 20,
      registrationOpen: false,
      handicapBaseScore: 35,
      handicapMultiplier: 0.9,
      handicapRounding: "floor",
      handicapDefault: 0,
      handicapMax: 9,
      courseName: "Pinehurst Golf Club",
      courseLocation: "Pinehurst, NC",
      playDay: "Wednesday",
      playTime: "5:00 PM",
      description: "A competitive 9-hole league with 18 teams battling it out over 10 weeks. Handicaps capped at 9 for balanced play.",
      contactEmail: "alex@golfleague.com",
      status: "active",
    },
  });
  console.log(`  Created "${league.name}" (id: ${league.id})`);

  // Create season
  const season = await prisma.season.create({
    data: {
      leagueId: league.id,
      name: "2026 Season",
      year: 2026,
      seasonNumber: 1,
      isActive: true,
      numberOfWeeks: NUM_WEEKS,
    },
  });
  console.log(`  Created season "${season.name}"`);

  // Create teams
  const teams: { id: number; name: string; skill: SkillTier }[] = [];
  for (const def of TEAMS) {
    const team = await prisma.team.create({
      data: {
        name: def.name,
        captainName: def.captain,
        email: def.email,
        phone: def.phone,
        status: "approved",
        totalPoints: 0,
        wins: 0,
        losses: 0,
        ties: 0,
        leagueId: league.id,
        seasonId: season.id,
      },
    });
    teams.push({ id: team.id, name: team.name, skill: def.skill });
  }
  console.log(`  Created ${teams.length} teams`);

  // Track gross scores per team for handicap calculation (excludes subs)
  const teamScores: Record<number, number[]> = {};
  teams.forEach((t) => (teamScores[t.id] = []));

  let totalMatchups = 0;
  let totalSubs = 0;

  // Generate matchups for each week
  for (let week = 1; week <= NUM_WEEKS; week++) {
    const pairings = generateWeekPairings(
      teams.map((t) => t.id),
      week
    );

    for (const [teamAId, teamBId] of pairings) {
      const teamA = teams.find((t) => t.id === teamAId)!;
      const teamB = teams.find((t) => t.id === teamBId)!;

      const teamAGross = generateGrossScore(teamA.skill);
      const teamBGross = generateGrossScore(teamB.skill);

      // Handicap: week 1 uses initial values, subsequent weeks use calculateHandicap
      const teamAHandicap =
        week === 1
          ? getInitialHandicap(teamA.skill)
          : calculateHandicap(teamScores[teamAId], HANDICAP_SETTINGS, week);
      const teamBHandicap =
        week === 1
          ? getInitialHandicap(teamB.skill)
          : calculateHandicap(teamScores[teamBId], HANDICAP_SETTINGS, week);

      const teamANet = calculateNetScore(teamAGross, teamAHandicap);
      const teamBNet = calculateNetScore(teamBGross, teamBHandicap);

      // Points from suggestPoints (always sum to 20)
      const { teamAPoints, teamBPoints } = suggestPoints(teamANet, teamBNet);

      // ~10% chance each slot is a sub
      const teamAIsSub = seededRandom() < 0.1;
      const teamBIsSub = seededRandom() < 0.1;

      if (teamAIsSub) totalSubs++;
      if (teamBIsSub) totalSubs++;

      await prisma.matchup.create({
        data: {
          weekNumber: week,
          teamAId,
          teamAGross,
          teamAHandicap,
          teamANet,
          teamAPoints,
          teamAIsSub,
          teamBId,
          teamBGross,
          teamBHandicap,
          teamBNet,
          teamBPoints,
          teamBIsSub,
          isForfeit: false,
          leagueId: league.id,
          seasonId: season.id,
        },
      });

      // Only track non-sub scores for handicap calculation
      if (!teamAIsSub) teamScores[teamAId].push(teamAGross);
      if (!teamBIsSub) teamScores[teamBId].push(teamBGross);

      // Update team stats
      const teamAWin = teamAPoints > teamBPoints ? 1 : 0;
      const teamBWin = teamBPoints > teamAPoints ? 1 : 0;
      const isTie = teamAPoints === teamBPoints ? 1 : 0;

      await prisma.team.update({
        where: { id: teamAId },
        data: {
          totalPoints: { increment: teamAPoints },
          wins: { increment: teamAWin },
          losses: { increment: teamBWin },
          ties: { increment: isTie },
        },
      });

      await prisma.team.update({
        where: { id: teamBId },
        data: {
          totalPoints: { increment: teamBPoints },
          wins: { increment: teamBWin },
          losses: { increment: teamAWin },
          ties: { increment: isTie },
        },
      });

      totalMatchups++;
    }
  }

  console.log(`  Created ${totalMatchups} matchups across ${NUM_WEEKS} weeks`);
  console.log(`  ${totalSubs} substitution slots (${((totalSubs / (totalMatchups * 2)) * 100).toFixed(1)}%)`);

  // Print standings
  const finalTeams = await prisma.team.findMany({
    where: { leagueId: league.id },
    orderBy: [{ totalPoints: "desc" }, { wins: "desc" }],
  });

  console.log("\n  Standings:");
  finalTeams.forEach((team, idx) => {
    console.log(
      `    ${String(idx + 1).padStart(2)}. ${team.name.padEnd(20)} ${team.totalPoints}pts  ${team.wins}W-${team.losses}L-${team.ties}T`
    );
  });

  // Verify handicap cap
  const matchups = await prisma.matchup.findMany({
    where: { leagueId: league.id },
  });
  const maxHcp = Math.max(
    ...matchups.map((m) => Math.max(m.teamAHandicap, m.teamBHandicap))
  );
  console.log(`\n  Max handicap in data: ${maxHcp} (cap: 9)`);

  // Verify points sum
  const badPoints = matchups.filter((m) => m.teamAPoints + m.teamBPoints !== 20);
  console.log(`  Matchups with points != 20: ${badPoints.length}`);

  console.log("\n  URL: /league/alexs-league");
  console.log(`  Admin password: ${LEAGUE_PASSWORD}`);
  console.log("\nDone.");
}

seed()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
