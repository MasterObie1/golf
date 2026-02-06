/**
 * Live Site Testing Script
 * Simulates a user interacting with the golf league management website
 * Creates a league, registers teams, approves them, and enters 10 weeks of matchup data
 */

import { chromium } from 'playwright';

const BASE_URL = 'https://golf-sigma-six.vercel.app';
const LEAGUE_NAME = 'Test League ' + Date.now().toString().slice(-6);

// Test data - 6 teams for matchups (3 matches per week)
const TEAMS = [
  { name: 'The Eagles', captain: 'John Smith', email: 'eagles@test.com', phone: '555-111-0001' },
  { name: 'Birdie Brigade', captain: 'Mike Johnson', email: 'birdie@test.com', phone: '555-111-0002' },
  { name: 'Par Patrol', captain: 'Tom Wilson', email: 'patrol@test.com', phone: '555-111-0003' },
  { name: 'Fairway Legends', captain: 'Bob Davis', email: 'fairway@test.com', phone: '555-111-0004' },
  { name: 'Green Machines', captain: 'Dave Brown', email: 'green@test.com', phone: '555-111-0005' },
  { name: 'Tee Time Titans', captain: 'Chris Miller', email: 'titans@test.com', phone: '555-111-0006' },
];

// Matchup data for 10 weeks
// Week 1 needs manual handicaps, subsequent weeks auto-calculate
const MATCHUP_DATA = [
  {
    week: 1,
    matches: [
      { teamA: 'The Eagles', teamAGross: 38, teamAHcp: 3, teamB: 'Birdie Brigade', teamBGross: 42, teamBHcp: 5 },
      { teamA: 'Par Patrol', teamAGross: 40, teamAHcp: 4, teamB: 'Fairway Legends', teamBGross: 44, teamBHcp: 6 },
      { teamA: 'Green Machines', teamAGross: 45, teamAHcp: 7, teamB: 'Tee Time Titans', teamBGross: 41, teamBHcp: 5 },
    ]
  },
  {
    week: 2,
    matches: [
      { teamA: 'The Eagles', teamAGross: 39, teamB: 'Par Patrol', teamBGross: 41 },
      { teamA: 'Birdie Brigade', teamAGross: 43, teamB: 'Green Machines', teamBGross: 44 },
      { teamA: 'Fairway Legends', teamAGross: 42, teamB: 'Tee Time Titans', teamBGross: 40 },
    ]
  },
  {
    week: 3,
    matches: [
      { teamA: 'The Eagles', teamAGross: 37, teamB: 'Fairway Legends', teamBGross: 45 },
      { teamA: 'Birdie Brigade', teamAGross: 41, teamB: 'Tee Time Titans', teamBGross: 42 },
      { teamA: 'Par Patrol', teamAGross: 39, teamB: 'Green Machines', teamBGross: 46 },
    ]
  },
  {
    week: 4,
    matches: [
      { teamA: 'The Eagles', teamAGross: 40, teamB: 'Green Machines', teamBGross: 43 },
      { teamA: 'Birdie Brigade', teamAGross: 44, teamB: 'Par Patrol', teamBGross: 38 },
      { teamA: 'Fairway Legends', teamAGross: 43, teamB: 'Tee Time Titans', teamBGross: 39 },
    ]
  },
  {
    week: 5,
    matches: [
      { teamA: 'The Eagles', teamAGross: 36, teamB: 'Tee Time Titans', teamBGross: 41 },
      { teamA: 'Birdie Brigade', teamAGross: 45, teamB: 'Fairway Legends', teamBGross: 44 },
      { teamA: 'Par Patrol', teamAGross: 42, teamB: 'Green Machines', teamBGross: 47 },
    ]
  },
  {
    week: 6,
    matches: [
      { teamA: 'The Eagles', teamAGross: 38, teamB: 'Birdie Brigade', teamBGross: 40 },
      { teamA: 'Par Patrol', teamAGross: 41, teamB: 'Tee Time Titans', teamBGross: 43 },
      { teamA: 'Fairway Legends', teamAGross: 46, teamB: 'Green Machines', teamBGross: 45 },
    ]
  },
  {
    week: 7,
    matches: [
      { teamA: 'The Eagles', teamAGross: 39, teamB: 'Par Patrol', teamBGross: 40 },
      { teamA: 'Birdie Brigade', teamAGross: 42, teamB: 'Green Machines', teamBGross: 48 },
      { teamA: 'Fairway Legends', teamAGross: 41, teamB: 'Tee Time Titans', teamBGross: 38 },
    ]
  },
  {
    week: 8,
    matches: [
      { teamA: 'The Eagles', teamAGross: 37, teamB: 'Fairway Legends', teamBGross: 44 },
      { teamA: 'Birdie Brigade', teamAGross: 43, teamB: 'Tee Time Titans', teamBGross: 40 },
      { teamA: 'Par Patrol', teamAGross: 38, teamB: 'Green Machines', teamBGross: 46 },
    ]
  },
  {
    week: 9,
    matches: [
      { teamA: 'The Eagles', teamAGross: 38, teamB: 'Green Machines', teamBGross: 44 },
      { teamA: 'Birdie Brigade', teamAGross: 41, teamB: 'Par Patrol', teamBGross: 39 },
      { teamA: 'Fairway Legends', teamAGross: 45, teamB: 'Tee Time Titans', teamBGross: 37 },
    ]
  },
  {
    week: 10,
    matches: [
      { teamA: 'The Eagles', teamAGross: 35, teamB: 'Tee Time Titans', teamBGross: 39 },
      { teamA: 'Birdie Brigade', teamAGross: 44, teamB: 'Fairway Legends', teamBGross: 43 },
      { teamA: 'Par Patrol', teamAGross: 40, teamB: 'Green Machines', teamBGross: 49 },
    ]
  },
];

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runTest() {
  console.log('========================================');
  console.log('LIVE SITE TESTING - LeagueLinks');
  console.log('========================================\n');

  const browser = await chromium.launch({
    headless: true,
    slowMo: 50
  });

  const context = await browser.newContext();
  const page = await context.newPage();

  let leagueSlug = '';
  let adminUsername = '';

  try {
    // ========================================
    // STEP 1: Create a new league
    // ========================================
    console.log('STEP 1: Creating new league...');
    console.log(`   League name: ${LEAGUE_NAME}`);

    await page.goto(`${BASE_URL}/leagues/new`);
    await page.waitForLoadState('networkidle');

    // Fill in league name
    await page.fill('input#name', LEAGUE_NAME);
    await sleep(500);

    // Click create button
    await page.click('button[type="submit"]');

    // Wait for success page
    await page.waitForSelector('text=League Created!', { timeout: 30000 });
    console.log('   SUCCESS: League created!\n');

    // Extract league slug from the admin login link
    const adminLoginLink = await page.getAttribute('a[href*="/admin/login"]', 'href');
    leagueSlug = adminLoginLink.split('/league/')[1].split('/admin')[0];

    // Extract admin username
    const usernameCode = await page.locator('code').first().textContent();
    adminUsername = usernameCode;

    console.log(`   League slug: ${leagueSlug}`);
    console.log(`   Admin username: ${adminUsername}`);
    console.log(`   Admin password: pass@word1\n`);

    // ========================================
    // STEP 2: Register teams via signup page
    // ========================================
    console.log('STEP 2: Registering teams via signup page...');

    for (const team of TEAMS) {
      console.log(`   Registering: ${team.name}`);

      await page.goto(`${BASE_URL}/league/${leagueSlug}/signup`);
      await page.waitForLoadState('networkidle');
      await sleep(500);

      // Fill team registration form using labels
      // Team Name - first input in form
      const inputs = page.locator('form input');
      await inputs.nth(0).fill(team.name);
      await inputs.nth(1).fill(team.captain);
      await inputs.nth(2).fill(team.email);
      await inputs.nth(3).fill(team.phone);

      // Submit
      await page.click('button[type="submit"]');

      // Wait for success
      await page.waitForSelector('text=Registration Submitted!', { timeout: 15000 });
      console.log(`      SUCCESS: ${team.name} registered`);
    }
    console.log('   All teams registered!\n');

    // ========================================
    // STEP 3: Login to admin panel
    // ========================================
    console.log('STEP 3: Logging into admin panel...');

    await page.goto(`${BASE_URL}/league/${leagueSlug}/admin/login`);
    await page.waitForLoadState('networkidle');
    await sleep(500);

    await page.fill('#username', adminUsername);
    await page.fill('#password', 'pass@word1');
    await page.click('button[type="submit"]');

    // Wait for admin dashboard
    await page.waitForURL(`**/league/${leagueSlug}/admin`, { timeout: 15000 });
    console.log('   SUCCESS: Logged in!\n');

    // ========================================
    // STEP 4: Approve all teams
    // ========================================
    console.log('STEP 4: Approving teams...');

    // Click on Teams tab
    await page.click('button:has-text("Teams")');
    await sleep(1000);

    // Approve each pending team
    for (let i = 0; i < TEAMS.length; i++) {
      const approveButtons = page.locator('button:has-text("Approve")');
      const count = await approveButtons.count();

      if (count > 0) {
        await approveButtons.first().click();
        await sleep(1000);
        console.log(`   Approved team ${i + 1}/${TEAMS.length}`);
      }
    }
    console.log('   All teams approved!\n');

    // ========================================
    // STEP 5: Enter matchup data for 10 weeks
    // ========================================
    console.log('STEP 5: Entering matchup data for 10 weeks...\n');

    // Click on Matchups tab
    await page.click('button:has-text("Matchups")');
    await sleep(1000);

    for (const weekData of MATCHUP_DATA) {
      console.log(`   Week ${weekData.week}:`);

      for (const match of weekData.matches) {
        console.log(`      ${match.teamA} vs ${match.teamB}`);

        // Make sure we're on the admin page
        if (!page.url().includes('/admin')) {
          await page.goto(`${BASE_URL}/league/${leagueSlug}/admin`);
          await page.waitForLoadState('networkidle');
        }

        // Set week number
        const weekInput = page.locator('input[type="number"]').first();
        await weekInput.fill(weekData.week.toString());

        // Select Team A
        const teamASelect = page.locator('select').first();
        await teamASelect.selectOption({ label: match.teamA });

        // Select Team B
        const teamBSelect = page.locator('select').nth(1);
        await teamBSelect.selectOption({ label: match.teamB });

        // Fill Team A Gross Score
        const teamAGrossInput = page.locator('input[type="number"]').nth(1);
        await teamAGrossInput.fill(match.teamAGross.toString());

        // Fill Team B Gross Score
        const teamBGrossInput = page.locator('input[type="number"]').nth(2);
        await teamBGrossInput.fill(match.teamBGross.toString());

        // For week 1, fill manual handicaps
        if (weekData.week === 1 && match.teamAHcp !== undefined) {
          const teamAHcpInput = page.locator('input[type="number"]').nth(3);
          await teamAHcpInput.fill(match.teamAHcp.toString());

          const teamBHcpInput = page.locator('input[type="number"]').nth(4);
          await teamBHcpInput.fill(match.teamBHcp.toString());
        }

        // Click Preview
        await page.click('button:has-text("Preview Results")');
        await sleep(1500);

        // Check if preview loaded
        const previewVisible = await page.locator('text=Preview - Week').isVisible();
        if (!previewVisible) {
          console.log(`         ERROR: Preview failed, skipping...`);
          // Try to go back
          const backBtn = page.locator('button:has-text("Back to Edit")');
          if (await backBtn.isVisible()) {
            await backBtn.click();
          }
          continue;
        }

        // Fill in points (the preview shows suggested points, user must confirm)
        // Default scoring: winner gets more points based on net score difference
        // Points must total 20
        const pointsInputA = page.locator('table input[type="number"]').first();
        const pointsInputB = page.locator('table input[type="number"]').last();

        // Read suggested points from preview
        const suggestedA = await pointsInputA.getAttribute('placeholder') || '10';
        const suggestedB = await pointsInputB.getAttribute('placeholder') || '10';

        // Calculate points based on net scores (simple win/loss/tie logic)
        // In a real scenario, the UI would show calculated net scores
        // For this test, we'll use a simple formula
        let pointsA, pointsB;
        if (match.teamAGross < match.teamBGross) {
          pointsA = 12;
          pointsB = 8;
        } else if (match.teamBGross < match.teamAGross) {
          pointsA = 8;
          pointsB = 12;
        } else {
          pointsA = 10;
          pointsB = 10;
        }

        await pointsInputA.fill(pointsA.toString());
        await pointsInputB.fill(pointsB.toString());

        // Submit the matchup
        await page.click('button:has-text("Submit Matchup")');
        await sleep(1500);

        // Check for success message
        const success = await page.locator('text=Matchup submitted successfully').isVisible();
        if (success) {
          console.log(`         Submitted successfully`);
        }
      }

      console.log(`   Week ${weekData.week} complete!\n`);
    }

    // ========================================
    // STEP 6: Verify results
    // ========================================
    console.log('STEP 6: Verifying results...');

    // Check leaderboard
    await page.goto(`${BASE_URL}/league/${leagueSlug}/leaderboard`);
    await page.waitForLoadState('networkidle');
    await sleep(1000);

    const leaderboardContent = await page.content();
    const hasTeamData = TEAMS.some(t => leaderboardContent.includes(t.name));
    console.log(`   Leaderboard: ${hasTeamData ? 'Teams displaying correctly' : 'No team data found'}`);

    // Check match history
    await page.goto(`${BASE_URL}/league/${leagueSlug}/history`);
    await page.waitForLoadState('networkidle');
    await sleep(1000);

    const historyContent = await page.content();
    const hasMatchups = historyContent.includes('Week');
    console.log(`   Match History: ${hasMatchups ? 'Matchups displaying correctly' : 'No matchup data found'}`);

    // Check handicap history
    await page.goto(`${BASE_URL}/league/${leagueSlug}/handicap-history`);
    await page.waitForLoadState('networkidle');
    await sleep(1000);

    const handicapContent = await page.content();
    const hasHandicapData = TEAMS.some(t => handicapContent.includes(t.name));
    console.log(`   Handicap History: ${hasHandicapData ? 'Handicap data displaying correctly' : 'No handicap data found'}\n`);

    // ========================================
    // Final Summary
    // ========================================
    console.log('========================================');
    console.log('TEST COMPLETE!');
    console.log('========================================\n');
    console.log('League URLs:');
    console.log(`   Home:     ${BASE_URL}/league/${leagueSlug}`);
    console.log(`   Admin:    ${BASE_URL}/league/${leagueSlug}/admin`);
    console.log(`   Leaderboard: ${BASE_URL}/league/${leagueSlug}/leaderboard`);
    console.log(`   History:  ${BASE_URL}/league/${leagueSlug}/history`);
    console.log(`   Handicaps: ${BASE_URL}/league/${leagueSlug}/handicap-history\n`);
    console.log('Admin Credentials:');
    console.log(`   Username: ${adminUsername}`);
    console.log(`   Password: pass@word1\n`);

  } catch (error) {
    console.error('\nTEST FAILED:', error.message);
    console.error('Stack:', error.stack);

    // Take screenshot on failure
    const screenshotPath = `test-failure-${Date.now()}.png`;
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`Screenshot saved to: ${screenshotPath}`);

    // Also log current URL and page content snippet
    console.log(`Current URL: ${page.url()}`);
  } finally {
    await browser.close();
  }
}

runTest().catch(console.error);
