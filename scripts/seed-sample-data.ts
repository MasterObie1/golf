// Seed script for sample league data - 3 leagues
// Run with: npx tsx scripts/seed-sample-data.ts

if (process.env.TURSO_DATABASE_URL || process.env.NODE_ENV === "production") {
  console.error("ERROR: Seed scripts must not run against production databases.");
  console.error("Detected TURSO_DATABASE_URL or NODE_ENV=production. Aborting.");
  process.exit(1);
}

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import * as bcrypt from "bcryptjs";

const adapter = new PrismaLibSql({
  url: "file:./dev.db",
});

const prisma = new PrismaClient({ adapter });

// Team skill levels - affects their typical scores
type SkillLevel = "elite" | "good" | "average" | "poor" | "struggling";

// Generate a realistic golf score based on skill level
function generateGrossScore(skill: SkillLevel): number {
  switch (skill) {
    case "elite":
      return 34 + Math.floor(Math.random() * 5);
    case "good":
      return 38 + Math.floor(Math.random() * 5);
    case "average":
      return 42 + Math.floor(Math.random() * 5);
    case "poor":
      return 46 + Math.floor(Math.random() * 5);
    case "struggling":
      return 48 + Math.floor(Math.random() * 7);
  }
}

// Calculate handicap from previous scores
function calculateHandicap(scores: number[]): number {
  if (scores.length === 0) return 0;
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  return Math.max(0, Math.floor((avg - 36) * 0.8));
}

// Generate matchup pairings for a week
function generateWeekPairings(teamIds: number[], weekNum: number): [number, number][] {
  const rotated = [...teamIds];
  for (let i = 0; i < (weekNum - 1) % (teamIds.length - 1); i++) {
    const last = rotated.pop()!;
    rotated.splice(1, 0, last);
  }

  const pairs: [number, number][] = [];
  const halfLen = Math.floor(teamIds.length / 2);
  for (let i = 0; i < halfLen; i++) {
    pairs.push([rotated[i], rotated[teamIds.length - 1 - i]]);
  }
  return pairs;
}

// Determine points based on net scores
function determinePoints(netA: number, netB: number): { teamAPoints: number; teamBPoints: number } {
  const diff = netA - netB;

  if (Math.abs(diff) <= 1) {
    const close = Math.random() < 0.4;
    if (close) {
      return { teamAPoints: 10, teamBPoints: 10 };
    }
    return diff <= 0
      ? { teamAPoints: 11, teamBPoints: 9 }
      : { teamAPoints: 9, teamBPoints: 11 };
  } else if (Math.abs(diff) <= 3) {
    const winnerPoints = 12 + Math.floor(Math.random() * 3);
    return diff < 0
      ? { teamAPoints: winnerPoints, teamBPoints: 20 - winnerPoints }
      : { teamAPoints: 20 - winnerPoints, teamBPoints: winnerPoints };
  } else {
    const winnerPoints = 15 + Math.floor(Math.random() * 3);
    return diff < 0
      ? { teamAPoints: winnerPoints, teamBPoints: 20 - winnerPoints }
      : { teamAPoints: 20 - winnerPoints, teamBPoints: winnerPoints };
  }
}

// Get initial handicap based on skill
function getInitialHandicap(skill: SkillLevel): number {
  switch (skill) {
    case "elite": return -1 + Math.floor(Math.random() * 2);
    case "good": return 2 + Math.floor(Math.random() * 2);
    case "average": return 4 + Math.floor(Math.random() * 2);
    case "poor": return 6 + Math.floor(Math.random() * 2);
    case "struggling": return 8 + Math.floor(Math.random() * 2);
  }
}

// League 1 data - Thursday Night Golf League (10 teams, 8 weeks)
const league1TeamNames = [
  "The Bogey Brothers",
  "Fairway Legends",
  "Bunker Busters",
  "Eagle Eyes",
  "Par Patrol",
  "Slice & Dice",
  "Putt Pirates",
  "Green Machine",
  "Tee Time Titans",
  "Birdie Brigade",
];

const league1Captains = [
  { name: "Mike Johnson", email: "mike.j@email.com", phone: "(555) 101-1001" },
  { name: "Steve Williams", email: "steve.w@email.com", phone: "(555) 102-1002" },
  { name: "Dave Roberts", email: "dave.r@email.com", phone: "(555) 103-1003" },
  { name: "Tom Anderson", email: "tom.a@email.com", phone: "(555) 104-1004" },
  { name: "Chris Martinez", email: "chris.m@email.com", phone: "(555) 105-1005" },
  { name: "Jeff Thompson", email: "jeff.t@email.com", phone: "(555) 106-1006" },
  { name: "Brian Garcia", email: "brian.g@email.com", phone: "(555) 107-1007" },
  { name: "Kevin Lee", email: "kevin.l@email.com", phone: "(555) 108-1008" },
  { name: "Mark Wilson", email: "mark.w@email.com", phone: "(555) 109-1009" },
  { name: "Paul Davis", email: "paul.d@email.com", phone: "(555) 110-1010" },
];

const league1Skills: SkillLevel[] = [
  "elite", "good", "average", "average", "good",
  "average", "poor", "average", "good", "struggling",
];

// League 2 data - Saturday Morning Golf League (8 teams, 6 weeks)
const league2TeamNames = [
  "Morning Mulligans",
  "Sunrise Swingers",
  "Early Birds",
  "Dew Sweepers",
  "Coffee & Clubs",
  "Dawn Drivers",
  "AM Aces",
  "First Light Foursome",
];

const league2Captains = [
  { name: "Bob Smith", email: "bob.s@email.com", phone: "(555) 201-2001" },
  { name: "Jim Brown", email: "jim.b@email.com", phone: "(555) 202-2002" },
  { name: "Rick Taylor", email: "rick.t@email.com", phone: "(555) 203-2003" },
  { name: "Dan Miller", email: "dan.m@email.com", phone: "(555) 204-2004" },
  { name: "Sam White", email: "sam.w@email.com", phone: "(555) 205-2005" },
  { name: "Joe Clark", email: "joe.c@email.com", phone: "(555) 206-2006" },
  { name: "Bill Hall", email: "bill.h@email.com", phone: "(555) 207-2007" },
  { name: "Ron King", email: "ron.k@email.com", phone: "(555) 208-2008" },
];

const league2Skills: SkillLevel[] = [
  "good", "elite", "average", "poor", "average", "good", "struggling", "average",
];

async function createLeagueWithMatches(
  leagueData: {
    name: string;
    slug: string;
    courseName?: string;
    courseLocation?: string;
    playDay?: string;
    playTime?: string;
    description?: string;
    contactEmail?: string;
  },
  teamNames: string[],
  captains: { name: string; email: string; phone: string }[],
  skills: SkillLevel[],
  weeks: number
) {
  const hashedPassword = await bcrypt.hash("pass@word1", 12);

  // Create league
  const league = await prisma.league.create({
    data: {
      name: leagueData.name,
      slug: leagueData.slug,
      adminUsername: `admin@${leagueData.slug.split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join("")}`,
      adminPassword: hashedPassword,
      maxTeams: 16,
      registrationOpen: false,
      handicapBaseScore: 35,
      handicapMultiplier: 0.9,
      handicapRounding: "floor",
      handicapDefault: 0,
      courseName: leagueData.courseName,
      courseLocation: leagueData.courseLocation,
      playDay: leagueData.playDay,
      playTime: leagueData.playTime,
      description: leagueData.description,
      contactEmail: leagueData.contactEmail,
      status: "active",
    },
  });
  console.log(`   ✓ Created "${league.name}" (slug: ${league.slug})`);

  // Create teams
  const teams: { id: number; name: string; skill: SkillLevel }[] = [];
  for (let i = 0; i < teamNames.length; i++) {
    const team = await prisma.team.create({
      data: {
        name: teamNames[i],
        captainName: captains[i].name,
        email: captains[i].email,
        phone: captains[i].phone,
        status: "approved",
        totalPoints: 0,
        wins: 0,
        losses: 0,
        ties: 0,
        leagueId: league.id,
      },
    });
    teams.push({ id: team.id, name: team.name, skill: skills[i] });
  }
  console.log(`   ✓ Created ${teams.length} teams`);

  // Track scores for handicap calculation
  const teamScores: Record<number, number[]> = {};
  teams.forEach((t) => (teamScores[t.id] = []));

  // Generate matchups
  for (let week = 1; week <= weeks; week++) {
    const pairings = generateWeekPairings(
      teams.map((t) => t.id),
      week
    );

    for (const [teamAId, teamBId] of pairings) {
      const teamA = teams.find((t) => t.id === teamAId)!;
      const teamB = teams.find((t) => t.id === teamBId)!;

      const teamAGross = generateGrossScore(teamA.skill);
      const teamBGross = generateGrossScore(teamB.skill);

      const teamAHandicap = week === 1
        ? getInitialHandicap(teamA.skill)
        : calculateHandicap(teamScores[teamAId]);
      const teamBHandicap = week === 1
        ? getInitialHandicap(teamB.skill)
        : calculateHandicap(teamScores[teamBId]);

      const teamANet = teamAGross - teamAHandicap;
      const teamBNet = teamBGross - teamBHandicap;

      const { teamAPoints, teamBPoints } = determinePoints(teamANet, teamBNet);

      const teamAIsSub = Math.random() < 0.1;
      const teamBIsSub = Math.random() < 0.1;

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
        },
      });

      if (!teamAIsSub) teamScores[teamAId].push(teamAGross);
      if (!teamBIsSub) teamScores[teamBId].push(teamBGross);

      const teamAWin = teamAPoints > teamBPoints ? 1 : 0;
      const teamBWin = teamBPoints > teamAPoints ? 1 : 0;
      const teamATie = teamAPoints === teamBPoints ? 1 : 0;

      await prisma.team.update({
        where: { id: teamAId },
        data: {
          totalPoints: { increment: teamAPoints },
          wins: { increment: teamAWin },
          losses: { increment: teamBWin },
          ties: { increment: teamATie },
        },
      });

      await prisma.team.update({
        where: { id: teamBId },
        data: {
          totalPoints: { increment: teamBPoints },
          wins: { increment: teamBWin },
          losses: { increment: teamAWin },
          ties: { increment: teamATie },
        },
      });
    }
  }
  console.log(`   ✓ Created ${weeks} weeks of matchups`);

  return league;
}

async function seed() {
  console.log("🌱 Starting seed...\n");

  // Clear existing data
  console.log("🗑️  Clearing existing data...");
  await prisma.matchup.deleteMany();
  await prisma.team.deleteMany();
  await prisma.league.deleteMany();
  console.log("   ✓ Cleared\n");

  // League 1: Thursday Night Golf League - 10 teams, 8 weeks
  console.log("🏌️ Creating League 1: Thursday Night Golf League");
  const league1 = await createLeagueWithMatches(
    {
      name: "Thursday Night Golf League",
      slug: "thursday-night-golf-league",
      courseName: "Pine Valley Golf Club",
      courseLocation: "Pine Valley, NJ",
      playDay: "Thursday",
      playTime: "5:30 PM",
      description: "A competitive 9-hole league for golfers of all skill levels. Join us every Thursday evening for great golf and camaraderie!",
      contactEmail: "thursday@golfleague.com",
    },
    league1TeamNames,
    league1Captains,
    league1Skills,
    8
  );

  console.log("");

  // League 2: Saturday Morning Golf League - 8 teams, 6 weeks
  console.log("🏌️ Creating League 2: Saturday Morning Golf League");
  const league2 = await createLeagueWithMatches(
    {
      name: "Saturday Morning Golf League",
      slug: "saturday-morning-golf-league",
      courseName: "Sunrise Golf Course",
      courseLocation: "Springfield, IL",
      playDay: "Saturday",
      playTime: "7:00 AM",
      description: "Start your weekend right with our early morning golf league. Coffee provided!",
      contactEmail: "saturday@golfleague.com",
    },
    league2TeamNames,
    league2Captains,
    league2Skills,
    6
  );

  console.log("");

  // League 3: Summer Golf League - empty
  console.log("🏌️ Creating League 3: Summer Golf League (empty)");
  const hashedPassword = await bcrypt.hash("pass@word1", 12);
  const league3 = await prisma.league.create({
    data: {
      name: "Summer Golf League",
      slug: "summer-golf-league",
      adminUsername: "admin@SummerGolfLeague",
      adminPassword: hashedPassword,
      maxTeams: 12,
      registrationOpen: true,
      handicapBaseScore: 35,
      handicapMultiplier: 0.9,
      handicapRounding: "floor",
      handicapDefault: 0,
      status: "active",
    },
  });
  console.log(`   ✓ Created "${league3.name}" (slug: ${league3.slug})`);
  console.log(`   ✓ No teams or matchups (registration open)`);

  // Print summary
  console.log("\n" + "=".repeat(60));
  console.log("✅ SEED COMPLETE\n");

  console.log("📋 League Summary:\n");

  // League 1 standings
  console.log(`1. ${league1.name}`);
  console.log(`   URL: /league/${league1.slug}`);
  console.log(`   Admin: ${league1.adminUsername} / pass@word1`);
  const league1Teams = await prisma.team.findMany({
    where: { leagueId: league1.id },
    orderBy: [{ totalPoints: "desc" }, { wins: "desc" }],
  });
  console.log(`   Teams: ${league1Teams.length}, Matchups: ${await prisma.matchup.count({ where: { leagueId: league1.id } })}`);
  console.log(`   Top 3:`);
  league1Teams.slice(0, 3).forEach((team, idx) => {
    console.log(`     ${idx + 1}. ${team.name} - ${team.totalPoints} pts`);
  });

  console.log("");

  // League 2 standings
  console.log(`2. ${league2.name}`);
  console.log(`   URL: /league/${league2.slug}`);
  console.log(`   Admin: ${league2.adminUsername} / pass@word1`);
  const league2Teams = await prisma.team.findMany({
    where: { leagueId: league2.id },
    orderBy: [{ totalPoints: "desc" }, { wins: "desc" }],
  });
  console.log(`   Teams: ${league2Teams.length}, Matchups: ${await prisma.matchup.count({ where: { leagueId: league2.id } })}`);
  console.log(`   Top 3:`);
  league2Teams.slice(0, 3).forEach((team, idx) => {
    console.log(`     ${idx + 1}. ${team.name} - ${team.totalPoints} pts`);
  });

  console.log("");

  // League 3
  console.log(`3. ${league3.name}`);
  console.log(`   URL: /league/${league3.slug}`);
  console.log(`   Admin: ${league3.adminUsername} / pass@word1`);
  console.log(`   Teams: 0, Matchups: 0`);
  console.log(`   Status: Registration Open`);

  console.log("\n" + "=".repeat(60));
  console.log("\n🔐 Super Admin: /sudo/login");
  console.log("   Username: alex");
  console.log("   Password: sudo123!");
}

seed()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
