if (process.env.TURSO_DATABASE_URL || process.env.NODE_ENV === "production") {
  console.error("ERROR: Seed scripts must not run against production databases.");
  console.error("Detected TURSO_DATABASE_URL or NODE_ENV=production. Aborting.");
  process.exit(1);
}

import { prisma } from "../src/lib/db";
import bcrypt from "bcryptjs";

async function main() {
  console.log("Creating test league with 2 years of history...\n");

  // Create the league
  const hashedPassword = await bcrypt.hash("admin123", 12);

  const league = await prisma.league.create({
    data: {
      name: "Thursday Night Golf League",
      slug: "thursday-night-golf",
      adminUsername: "admin@ThursdayNightGolfLeague",
      adminPassword: hashedPassword,
      maxTeams: 12,
      registrationOpen: true,
      courseName: "Pine Valley Golf Club",
      courseLocation: "Springfield, IL",
      playDay: "Thursday",
      playTime: "5:30 PM",
      description: "A friendly weekly golf league for players of all skill levels.",
      handicapBaseScore: 36,
      handicapMultiplier: 0.9,
      handicapRounding: "floor",
      handicapDefault: 0,
    },
  });
  console.log(`Created league: ${league.name} (slug: ${league.slug})`);

  // Create Season 1 (2024)
  const season1 = await prisma.season.create({
    data: {
      leagueId: league.id,
      name: "2024 Season",
      year: 2024,
      seasonNumber: 1,
      isActive: false,
      numberOfWeeks: 16,
    },
  });
  console.log(`Created season: ${season1.name}`);

  // Create Season 2 (2025) - Active
  const season2 = await prisma.season.create({
    data: {
      leagueId: league.id,
      name: "2025 Season",
      year: 2025,
      seasonNumber: 2,
      isActive: true,
      numberOfWeeks: 16,
    },
  });
  console.log(`Created season: ${season2.name} (Active)`);

  // Team names
  const teamNames = [
    "The Bogey Boys",
    "Fairway Legends",
    "Par-Tee Time",
    "Slice & Dice",
    "The Mulligans",
    "Birdie Brigade",
  ];

  // Create teams for Season 1
  const season1Teams: { id: number; name: string }[] = [];
  for (const name of teamNames) {
    const team = await prisma.team.create({
      data: {
        name,
        leagueId: league.id,
        seasonId: season1.id,
        captainName: `Captain ${name.split(" ")[1] || name.split(" ")[0]}`,
        email: `${name.toLowerCase().replace(/\s+/g, "")}@example.com`,
        status: "approved",
      },
    });
    season1Teams.push({ id: team.id, name: team.name });
  }
  console.log(`Created ${season1Teams.length} teams for Season 1`);

  // Create teams for Season 2 (same teams, fresh stats)
  const season2Teams: { id: number; name: string }[] = [];
  for (const name of teamNames) {
    const team = await prisma.team.create({
      data: {
        name,
        leagueId: league.id,
        seasonId: season2.id,
        captainName: `Captain ${name.split(" ")[1] || name.split(" ")[0]}`,
        email: `${name.toLowerCase().replace(/\s+/g, "")}@example.com`,
        status: "approved",
      },
    });
    season2Teams.push({ id: team.id, name: team.name });
  }
  console.log(`Created ${season2Teams.length} teams for Season 2`);

  // Generate matchups for Season 1 (12 weeks of play)
  console.log("\nGenerating Season 1 matchups...");
  await generateSeasonMatchups(league.id, season1.id, season1Teams, 12);

  // Generate matchups for Season 2 (6 weeks so far)
  console.log("Generating Season 2 matchups...");
  await generateSeasonMatchups(league.id, season2.id, season2Teams, 6);

  console.log("\n✅ Test league created successfully!");
  console.log(`\nAccess the league at: http://localhost:3000/league/${league.slug}`);
  console.log(`Admin login: admin@ThursdayNightGolfLeague / admin123`);
}

async function generateSeasonMatchups(
  leagueId: number,
  seasonId: number,
  teams: { id: number; name: string }[],
  weeks: number
) {
  // Generate round-robin matchups
  const numTeams = teams.length;

  for (let week = 1; week <= weeks; week++) {
    // Create 3 matchups per week (6 teams = 3 matchups)
    const shuffled = [...teams].sort(() => Math.random() - 0.5);

    for (let i = 0; i < numTeams; i += 2) {
      const teamA = shuffled[i];
      const teamB = shuffled[i + 1];

      // Generate realistic scores (9-hole, par 36)
      const teamAGross = 38 + Math.floor(Math.random() * 12); // 38-49
      const teamBGross = 38 + Math.floor(Math.random() * 12); // 38-49

      // Calculate handicaps based on previous scores (simplified)
      const teamAHandicap = Math.floor((teamAGross - 36) * 0.9);
      const teamBHandicap = Math.floor((teamBGross - 36) * 0.9);

      const teamANet = teamAGross - teamAHandicap;
      const teamBNet = teamBGross - teamBHandicap;

      // Determine points (20 total)
      let teamAPoints: number;
      let teamBPoints: number;

      if (teamANet < teamBNet) {
        teamAPoints = 12 + Math.floor(Math.random() * 4); // 12-15
        teamBPoints = 20 - teamAPoints;
      } else if (teamBNet < teamANet) {
        teamBPoints = 12 + Math.floor(Math.random() * 4); // 12-15
        teamAPoints = 20 - teamBPoints;
      } else {
        teamAPoints = 10;
        teamBPoints = 10;
      }

      // Create the matchup
      await prisma.matchup.create({
        data: {
          leagueId,
          seasonId,
          weekNumber: week,
          teamAId: teamA.id,
          teamBId: teamB.id,
          teamAGross,
          teamBGross,
          teamAHandicap,
          teamBHandicap,
          teamANet,
          teamBNet,
          teamAPoints,
          teamBPoints,
          teamAIsSub: false,
          teamBIsSub: false,
          isForfeit: false,
        },
      });

      // Update team stats
      const teamAWon = teamAPoints > teamBPoints;
      const teamBWon = teamBPoints > teamAPoints;
      const tie = teamAPoints === teamBPoints;

      await prisma.team.update({
        where: { id: teamA.id },
        data: {
          totalPoints: { increment: teamAPoints },
          wins: { increment: teamAWon ? 1 : 0 },
          losses: { increment: teamBWon ? 1 : 0 },
          ties: { increment: tie ? 1 : 0 },
        },
      });

      await prisma.team.update({
        where: { id: teamB.id },
        data: {
          totalPoints: { increment: teamBPoints },
          wins: { increment: teamBWon ? 1 : 0 },
          losses: { increment: teamAWon ? 1 : 0 },
          ties: { increment: tie ? 1 : 0 },
        },
      });
    }
  }

  console.log(`  Created ${weeks * 3} matchups for ${weeks} weeks`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
