/**
 * Seed script: creates example approved scorecards viewable on the history page.
 *
 * Run with:  npx tsx scripts/seed-scorecards-demo.ts
 *
 * What it does:
 *  - Enables scorecardMode on the Thursday Night Golf League
 *  - Creates week 7 + 8 matchups
 *  - Creates approved scorecards with hole-by-hole data for several teams
 *  - Approves the existing "completed" scorecard for Fairway Legends (week 7)
 *  - Leaves some teams WITHOUT scorecards so you can see the difference
 */

if (process.env.TURSO_DATABASE_URL || process.env.NODE_ENV === "production") {
  console.error("ERROR: Seed scripts must not run against production databases.");
  console.error("Detected TURSO_DATABASE_URL or NODE_ENV=production. Aborting.");
  process.exit(1);
}

import { prisma } from "../src/lib/db";

// ── Hole score generation ──────────────────────────────

const PARS = [4, 3, 5, 4, 4, 3, 4, 5, 4]; // holes 1-9

type Skill = "good" | "average" | "bad";

function generateHoleScores(skill: Skill): number[] {
  return PARS.map((par) => {
    const r = Math.random();
    switch (skill) {
      case "good":
        // birdie 15%, par 45%, bogey 30%, double 10%
        if (r < 0.15) return par - 1;
        if (r < 0.60) return par;
        if (r < 0.90) return par + 1;
        return par + 2;
      case "average":
        // birdie 5%, par 30%, bogey 40%, double 20%, triple 5%
        if (r < 0.05) return par - 1;
        if (r < 0.35) return par;
        if (r < 0.75) return par + 1;
        if (r < 0.95) return par + 2;
        return par + 3;
      case "bad":
        // par 15%, bogey 35%, double 30%, triple 15%, quad 5%
        if (r < 0.15) return par;
        if (r < 0.50) return par + 1;
        if (r < 0.80) return par + 2;
        if (r < 0.95) return par + 3;
        return par + 4;
    }
  });
}

async function createApprovedScorecard(
  leagueId: number,
  courseId: number,
  teamId: number,
  seasonId: number,
  weekNumber: number,
  matchupId: number | null,
  teamSide: string | null,
  skill: Skill,
  playerName: string
) {
  const holeStrokes = generateHoleScores(skill);
  const grossTotal = holeStrokes.reduce((a, b) => a + b, 0);
  const frontNine = grossTotal; // 9-hole course, front = total

  // Upsert scorecard (may already exist from previous seeds)
  const existing = await prisma.scorecard.findUnique({
    where: { leagueId_weekNumber_teamId: { leagueId, weekNumber, teamId } },
  });

  let scorecardId: number;

  if (existing) {
    await prisma.scorecard.update({
      where: { id: existing.id },
      data: {
        status: "approved",
        grossTotal,
        frontNine,
        backNine: null,
        playerName,
        matchupId,
        teamSide,
        completedAt: new Date(),
        approvedAt: new Date(),
      },
    });
    scorecardId = existing.id;
    // Delete old hole scores
    await prisma.holeScore.deleteMany({ where: { scorecardId } });
  } else {
    const sc = await prisma.scorecard.create({
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
        backNine: null,
        status: "approved",
        playerName,
        completedAt: new Date(),
        approvedAt: new Date(),
      },
    });
    scorecardId = sc.id;
  }

  // Get hole IDs
  const holes = await prisma.hole.findMany({
    where: { courseId },
    orderBy: { holeNumber: "asc" },
    select: { id: true, holeNumber: true },
  });

  // Create hole scores
  for (const hole of holes) {
    await prisma.holeScore.upsert({
      where: { scorecardId_holeNumber: { scorecardId, holeNumber: hole.holeNumber } },
      create: {
        scorecardId,
        holeId: hole.id,
        holeNumber: hole.holeNumber,
        strokes: holeStrokes[hole.holeNumber - 1],
      },
      update: {
        strokes: holeStrokes[hole.holeNumber - 1],
      },
    });
  }

  return { scorecardId, grossTotal };
}

async function main() {
  console.log("Seeding scorecard demo data for Thursday Night Golf League...\n");

  const leagueId = 1;
  const courseId = 1;
  const seasonId = 1;

  // 1. Enable scorecards on the league
  await prisma.league.update({
    where: { id: leagueId },
    data: { scorecardMode: "optional" },
  });
  console.log("Enabled scorecardMode = 'optional'");

  // 2. Get teams
  const teams = await prisma.team.findMany({
    where: { leagueId },
    select: { id: true, name: true },
    orderBy: { id: "asc" },
  });
  const teamMap = new Map(teams.map((t) => [t.id, t.name]));

  // 3. Create week 7 matchups (to back the existing scorecards)
  //    Pairings: 1v2, 3v4, 5v6, 7v8 (team 9 bye)
  const week7Pairings: [number, number][] = [[1, 2], [3, 4], [5, 6], [7, 8]];
  const week7Matchups: { id: number; teamAId: number; teamBId: number }[] = [];

  for (const [aId, bId] of week7Pairings) {
    const existing = await prisma.matchup.findFirst({
      where: { leagueId, seasonId, weekNumber: 7, teamAId: aId, teamBId: bId },
    });
    if (existing) {
      week7Matchups.push({ id: existing.id, teamAId: aId, teamBId: bId });
      continue;
    }

    const aGross = 38 + Math.floor(Math.random() * 10);
    const bGross = 38 + Math.floor(Math.random() * 10);
    const aHcp = Math.floor((aGross - 36) * 0.9);
    const bHcp = Math.floor((bGross - 36) * 0.9);
    const aNet = aGross - aHcp;
    const bNet = bGross - bHcp;
    let aPts: number, bPts: number;
    if (aNet < bNet) { aPts = 13; bPts = 7; }
    else if (bNet < aNet) { bPts = 13; aPts = 7; }
    else { aPts = 10; bPts = 10; }

    const m = await prisma.matchup.create({
      data: {
        leagueId, seasonId, weekNumber: 7,
        teamAId: aId, teamBId: bId,
        teamAGross: aGross, teamBGross: bGross,
        teamAHandicap: aHcp, teamBHandicap: bHcp,
        teamANet: aNet, teamBNet: bNet,
        teamAPoints: aPts, teamBPoints: bPts,
        teamAIsSub: false, teamBIsSub: false,
        isForfeit: false,
      },
    });
    week7Matchups.push({ id: m.id, teamAId: aId, teamBId: bId });
  }
  console.log(`Created/found ${week7Matchups.length} week 7 matchups`);

  // 4. Create week 8 matchups
  const week8Pairings: [number, number][] = [[1, 5], [2, 3], [4, 7], [6, 8]];
  const week8Matchups: { id: number; teamAId: number; teamBId: number }[] = [];

  for (const [aId, bId] of week8Pairings) {
    const existing = await prisma.matchup.findFirst({
      where: { leagueId, seasonId, weekNumber: 8, teamAId: aId, teamBId: bId },
    });
    if (existing) {
      week8Matchups.push({ id: existing.id, teamAId: aId, teamBId: bId });
      continue;
    }

    const aGross = 38 + Math.floor(Math.random() * 10);
    const bGross = 38 + Math.floor(Math.random() * 10);
    const aHcp = Math.floor((aGross - 36) * 0.9);
    const bHcp = Math.floor((bGross - 36) * 0.9);
    const aNet = aGross - aHcp;
    const bNet = bGross - bHcp;
    let aPts: number, bPts: number;
    if (aNet < bNet) { aPts = 14; bPts = 6; }
    else if (bNet < aNet) { bPts = 14; aPts = 6; }
    else { aPts = 10; bPts = 10; }

    const m = await prisma.matchup.create({
      data: {
        leagueId, seasonId, weekNumber: 8,
        teamAId: aId, teamBId: bId,
        teamAGross: aGross, teamBGross: bGross,
        teamAHandicap: aHcp, teamBHandicap: bHcp,
        teamANet: aNet, teamBNet: bNet,
        teamAPoints: aPts, teamBPoints: bPts,
        teamAIsSub: false, teamBIsSub: false,
        isForfeit: false,
      },
    });
    week8Matchups.push({ id: m.id, teamAId: aId, teamBId: bId });
  }
  console.log(`Created/found ${week8Matchups.length} week 8 matchups`);

  // 5. Create approved scorecards for week 7
  //    Teams 1 (The Bogey Boys) + 2 (Fairway Legends) already have scorecards — update them
  //    Teams 3 (Par-Tee Time) gets a scorecard too
  //    Teams 4, 5, 6, 7, 8 — NO scorecards (to show the contrast)
  const m_1v2 = week7Matchups.find((m) => m.teamAId === 1 && m.teamBId === 2);
  const m_3v4 = week7Matchups.find((m) => m.teamAId === 3 && m.teamBId === 4);

  const sc1 = await createApprovedScorecard(leagueId, courseId, 1, seasonId, 7, m_1v2?.id ?? null, "A", "average", "Mike Johnson");
  console.log(`  Week 7: ${teamMap.get(1)} — gross ${sc1.grossTotal} (approved)`);

  const sc2 = await createApprovedScorecard(leagueId, courseId, 2, seasonId, 7, m_1v2?.id ?? null, "B", "good", "Steve Williams");
  console.log(`  Week 7: ${teamMap.get(2)} — gross ${sc2.grossTotal} (approved)`);

  const sc3 = await createApprovedScorecard(leagueId, courseId, 3, seasonId, 7, m_3v4?.id ?? null, "A", "bad", "Dave Roberts");
  console.log(`  Week 7: ${teamMap.get(3)} — gross ${sc3.grossTotal} (approved)`);

  console.log(`  Week 7: ${teamMap.get(4)} — no scorecard`);
  console.log(`  Week 7: ${teamMap.get(5)} — no scorecard`);
  console.log(`  Week 7: ${teamMap.get(6)} — no scorecard`);

  // 6. Create approved scorecards for week 8
  //    All 4 matchups: give some teams scorecards, some not
  const m_1v5 = week8Matchups.find((m) => m.teamAId === 1 && m.teamBId === 5);
  const m_2v3 = week8Matchups.find((m) => m.teamAId === 2 && m.teamBId === 3);
  const m_4v7 = week8Matchups.find((m) => m.teamAId === 4 && m.teamBId === 7);

  const sc4 = await createApprovedScorecard(leagueId, courseId, 1, seasonId, 8, m_1v5?.id ?? null, "A", "good", "Mike Johnson");
  console.log(`  Week 8: ${teamMap.get(1)} — gross ${sc4.grossTotal} (approved)`);

  const sc5 = await createApprovedScorecard(leagueId, courseId, 5, seasonId, 8, m_1v5?.id ?? null, "B", "average", "Chris Martinez");
  console.log(`  Week 8: ${teamMap.get(5)} — gross ${sc5.grossTotal} (approved)`);

  const sc6 = await createApprovedScorecard(leagueId, courseId, 2, seasonId, 8, m_2v3?.id ?? null, "A", "good", "Steve Williams");
  console.log(`  Week 8: ${teamMap.get(2)} — gross ${sc6.grossTotal} (approved)`);

  console.log(`  Week 8: ${teamMap.get(3)} — no scorecard`);

  const sc7 = await createApprovedScorecard(leagueId, courseId, 4, seasonId, 8, m_4v7?.id ?? null, "A", "bad", "Tom Anderson");
  console.log(`  Week 8: ${teamMap.get(4)} — gross ${sc7.grossTotal} (approved)`);

  console.log(`  Week 8: ${teamMap.get(7)} — no scorecard`);
  console.log(`  Week 8: ${teamMap.get(6)} — no scorecard`);
  console.log(`  Week 8: ${teamMap.get(8)} — no scorecard`);

  console.log("\nDone! View at: http://localhost:3000/league/thursday-night-golf/history");
  console.log("\nWhat to look for:");
  console.log("  - Round 8: Bogey Boys, Fairway Legends, Mulligans, Slice & Dice have chevrons");
  console.log("  - Round 7: Bogey Boys, Fairway Legends, Par-Tee Time have chevrons");
  console.log("  - Rounds 1-6: no chevrons (no scorecards)");
  console.log("  - Click a chevron to expand and see the hole-by-hole scorecard");
}

main()
  .catch((e) => {
    console.error("Failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
