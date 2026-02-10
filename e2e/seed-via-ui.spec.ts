/**
 * Seed "Alex's League" matchups via the live UI using Playwright.
 *
 * Prereqs: League already exists at alex-s-league with 16 approved teams and a season.
 * This script enters 10 weeks of matchups (8 matchups per week for 16 teams).
 *
 * Usage:
 *   BASE_URL=https://leaguelinks.vercel.app npx playwright test e2e/seed-via-ui.spec.ts --reporter=list
 */

import { test, expect } from "@playwright/test";
import { calculateHandicap as _calculateHandicap, DEFAULT_HANDICAP_SETTINGS } from "../src/lib/handicap";

const LEAGUE_SLUG = "alex-s-league";
const LEAGUE_PASSWORD = "alexleague123";
const NUM_WEEKS = 10;

// Skill tiers for score generation (mapped to team names alphabetically as they appear in dropdowns)
type SkillTier = "elite" | "good" | "average" | "below_average" | "poor" | "struggling";

const TEAM_SKILLS: Record<string, SkillTier> = {
  "The Aces": "elite",
  "Eagle Squadron": "elite",
  "Birdie Bunch": "good",
  "Fairway Legends": "good",
  "Par Patrol": "good",
  "Green Machine": "average",
  "Divot Diggers": "average",
  "Putt Pirates": "average",
  "Tee Time Titans": "average",
  "Cart Path Cruisers": "average",
  "Slice & Dice": "below_average",
  "Bunker Busters": "below_average",
  "Sand Trappers": "below_average",
  "Mulligan Masters": "below_average",
  "Rough Riders": "poor",
  "Double Bogeys": "struggling",
};

// Seeded random for reproducibility
let seedValue = 42;
function seededRandom(): number {
  seedValue = (seedValue * 16807 + 0) % 2147483647;
  return (seedValue - 1) / 2147483646;
}

function generateGrossScore(skill: SkillTier): number {
  const r = seededRandom();
  switch (skill) {
    case "elite":         return 33 + Math.floor(r * 5);
    case "good":          return 37 + Math.floor(r * 5);
    case "average":       return 41 + Math.floor(r * 5);
    case "below_average": return 44 + Math.floor(r * 5);
    case "poor":          return 47 + Math.floor(r * 5);
    case "struggling":    return 50 + Math.floor(r * 5);
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

function calculateHandicap(scores: number[], baseScore: number, multiplier: number, maxHandicap: number): number {
  return _calculateHandicap(scores, {
    ...DEFAULT_HANDICAP_SETTINGS,
    baseScore,
    multiplier,
    maxHandicap,
    minHandicap: 0,
  });
}

// Round-robin for even number of teams
function generateWeekPairings(teamCount: number, weekNum: number): [number, number][] {
  const indices = Array.from({ length: teamCount }, (_, i) => i);
  const rotated = [...indices];
  for (let i = 0; i < (weekNum - 1) % (teamCount - 1); i++) {
    const last = rotated.pop()!;
    rotated.splice(1, 0, last);
  }
  const pairs: [number, number][] = [];
  const half = Math.floor(teamCount / 2);
  for (let i = 0; i < half; i++) {
    pairs.push([rotated[i], rotated[teamCount - 1 - i]]);
  }
  return pairs;
}

test.describe.configure({ timeout: 600000 });

test("Seed matchups via UI", async ({ page }) => {
  test.setTimeout(600000);

  // Login
  console.log("\n=== Logging in ===");
  await page.goto(`/league/${LEAGUE_SLUG}/admin/login`);
  await page.fill("#password", LEAGUE_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(`**/${LEAGUE_SLUG}/admin`, { timeout: 15000 });
  console.log("  Logged in!");

  // Go to matchups tab
  await page.click("button:has-text('Matchups')");
  await page.waitForTimeout(1000);

  // Read team names from the dropdown
  const teamASection = page.locator("div.bg-gray-50:has(h3:has-text('Team A'))");
  const teamBSection = page.locator("div.bg-gray-50:has(h3:has-text('Team B'))");
  const options = await teamASection.locator("select option").allTextContents();
  const teamNames = options.filter(o => o !== "-- Select Team --");
  console.log(`  Found ${teamNames.length} teams: ${teamNames.join(", ")}`);

  if (teamNames.length < 2) {
    throw new Error("Not enough teams to create matchups");
  }

  // Track scores per team for handicap calculation
  const teamScores: Record<string, number[]> = {};
  teamNames.forEach(name => (teamScores[name] = []));

  const matchupsPerWeek = Math.floor(teamNames.length / 2);
  let totalEntered = 0;

  console.log(`\n=== Entering ${NUM_WEEKS} weeks x ${matchupsPerWeek} matchups ===`);

  for (let week = 1; week <= NUM_WEEKS; week++) {
    const pairings = generateWeekPairings(teamNames.length, week);
    console.log(`\n  --- Week ${week} ---`);

    for (let m = 0; m < pairings.length; m++) {
      const [aIdx, bIdx] = pairings[m];
      const nameA = teamNames[aIdx];
      const nameB = teamNames[bIdx];
      const skillA = TEAM_SKILLS[nameA] || "average";
      const skillB = TEAM_SKILLS[nameB] || "average";

      const grossA = generateGrossScore(skillA);
      const grossB = generateGrossScore(skillB);

      const hcpA = week === 1
        ? getInitialHandicap(skillA)
        : calculateHandicap(teamScores[nameA], 35, 0.9, 9);
      const hcpB = week === 1
        ? getInitialHandicap(skillB)
        : calculateHandicap(teamScores[nameB], 35, 0.9, 9);

      // ~10% subs (consume random state but don't use subs to keep it simpler)
      seededRandom(); seededRandom();

      // Track scores
      teamScores[nameA].push(grossA);
      teamScores[nameB].push(grossB);

      // Fill week number
      const weekSection = page.locator("div:has(> label:has-text('Week Number'))");
      await weekSection.locator("input[type='number']").fill(String(week));

      // Team A
      await teamASection.locator("select").selectOption({ label: nameA });
      await teamASection.locator("input[type='number']").first().fill(String(grossA));
      if (week === 1) {
        await teamASection.locator("input[type='number']").nth(1).fill(String(hcpA));
      }

      // Team B
      await teamBSection.locator("select").selectOption({ label: nameB });
      await teamBSection.locator("input[type='number']").first().fill(String(grossB));
      if (week === 1) {
        await teamBSection.locator("input[type='number']").nth(1).fill(String(hcpB));
      }

      // Preview + Submit
      await page.click("button:has-text('Preview Results')");

      // Wait for either preview panel (Submit button) or error message
      const previewResult = await Promise.race([
        page.locator("button:has-text('Submit Matchup')").waitFor({ timeout: 15000 }).then(() => "preview"),
        page.locator("[class*='bg-red']").waitFor({ timeout: 15000 }).then(() => "error"),
      ]).catch(() => "timeout");

      if (previewResult === "error") {
        const errText = await page.locator("[class*='bg-red']").first().textContent();
        console.log(`    ERROR: ${errText} — retrying...`);
        // Click "Back to Edit" if visible, then retry
        const backBtn = page.locator("button:has-text('Back to Edit')");
        if (await backBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
          await backBtn.click();
        }
        await page.waitForTimeout(1000);
        await page.click("button:has-text('Preview Results')");
        await expect(page.locator("button:has-text('Submit Matchup')")).toBeVisible({ timeout: 15000 });
      } else if (previewResult === "timeout") {
        await page.screenshot({ path: `test-results/matchup-timeout-W${week}M${m+1}.png` });
        throw new Error(`Preview timed out for W${week} M${m+1}`);
      }

      await page.click("button:has-text('Submit Matchup')");
      await expect(page.locator("text=submitted successfully")).toBeVisible({ timeout: 15000 });
      await page.waitForTimeout(300);

      totalEntered++;
      console.log(`    [W${week} M${m + 1}] ${nameA} (${grossA}) vs ${nameB} (${grossB})`);
    }
  }

  console.log(`\n=== Done! Entered ${totalEntered} matchups ===`);
  console.log(`  View: /league/${LEAGUE_SLUG}`);
});
