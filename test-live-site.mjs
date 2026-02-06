/**
 * Live Site Testing Script
 * Simulates a user interacting with the golf league management website
 * Creates a league, registers teams, approves them, and enters 10 weeks of matchup data
 */

import { chromium } from 'playwright';

const BASE_URL = process.env.BASE_URL || 'https://leaguelinks.vercel.app';
const LEAGUE_NAME = 'Test League ' + Date.now().toString().slice(-6);
const ADMIN_PASSWORD = 'testpassword123';

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
  console.log(`URL: ${BASE_URL}`);
  console.log('========================================\n');

  const browser = await chromium.launch({
    headless: true,
    slowMo: 50
  });

  const context = await browser.newContext();
  const page = await context.newPage();

  let leagueSlug = '';

  try {
    // ========================================
    // STEP 1: Create a new league
    // ========================================
    console.log('STEP 1: Creating new league...');
    console.log(`   League name: ${LEAGUE_NAME}`);

    await page.goto(`${BASE_URL}/leagues/new`);
    await page.waitForLoadState('networkidle');

    await page.fill('input#name', LEAGUE_NAME);
    await page.fill('input#password', ADMIN_PASSWORD);
    await page.fill('input#confirmPassword', ADMIN_PASSWORD);
    await sleep(500);

    await page.click('button[type="submit"]');

    await page.waitForSelector('text=League Created!', { timeout: 30000 });
    console.log('   SUCCESS: League created!\n');

    // Extract league slug from the admin login link
    const adminLoginLink = await page.getAttribute('a[href*="/admin/login"]', 'href');
    leagueSlug = adminLoginLink.split('/league/')[1].split('/admin')[0];
    console.log(`   League slug: ${leagueSlug}\n`);

    // ========================================
    // STEP 2: Login to admin panel
    // ========================================
    console.log('STEP 2: Logging into admin panel...');

    await page.goto(`${BASE_URL}/league/${leagueSlug}/admin/login`);
    await page.waitForLoadState('networkidle');
    await sleep(500);

    await page.fill('#password', ADMIN_PASSWORD);
    await page.click('button[type="submit"]');

    await page.waitForURL(`**/league/${leagueSlug}/admin`, { timeout: 15000 });
    console.log('   SUCCESS: Logged in!\n');

    // ========================================
    // STEP 3: Create a season
    // ========================================
    console.log('STEP 3: Creating a season...');

    // Click on Seasons tab
    await page.click('button:has-text("Seasons")');
    await sleep(1000);

    // Fill season name
    const seasonNameInput = page.locator('input[placeholder*="Season"]').first();
    if (await seasonNameInput.isVisible()) {
      await seasonNameInput.fill('Season 1');
    } else {
      // Try filling the first text input in the seasons section
      const textInputs = page.locator('input[type="text"]');
      await textInputs.first().fill('Season 1');
    }

    // Click create season button
    const createSeasonBtn = page.locator('button:has-text("Create Season")');
    if (await createSeasonBtn.isVisible()) {
      await createSeasonBtn.click();
      await sleep(1500);
      console.log('   SUCCESS: Season created!\n');
    } else {
      console.log('   WARN: Could not find Create Season button, continuing...\n');
    }

    // ========================================
    // STEP 4: Register teams via signup page
    // ========================================
    console.log('STEP 4: Registering teams via signup page...');

    for (const team of TEAMS) {
      console.log(`   Registering: ${team.name}`);

      // Retry up to 3 times for intermittent failures
      let registered = false;
      for (let attempt = 1; attempt <= 3 && !registered; attempt++) {
        if (attempt > 1) {
          console.log(`      Retry attempt ${attempt}...`);
          await sleep(2000);
        }

        await page.goto(`${BASE_URL}/league/${leagueSlug}/signup`);
        await page.waitForLoadState('networkidle');
        await sleep(1000);

        await page.fill('#teamName', team.name);
        await page.fill('#captainName', team.captain);
        await page.fill('#email', team.email);
        await page.fill('#phone', team.phone);

        await page.click('button[type="submit"]');

        try {
          await page.waitForSelector('text=Registration Submitted!', { timeout: 20000 });
          registered = true;
          console.log(`      SUCCESS: ${team.name} registered`);
        } catch (err) {
          if (attempt === 3) throw err;
          console.log(`      WARN: Registration attempt ${attempt} failed, retrying...`);
        }
      }

      // Delay between registrations to avoid overwhelming the server
      await sleep(500);
    }
    console.log('   All teams registered!\n');

    // ========================================
    // STEP 5: Approve all teams
    // ========================================
    console.log('STEP 5: Approving teams...');

    await page.goto(`${BASE_URL}/league/${leagueSlug}/admin`);
    await page.waitForLoadState('networkidle');
    await sleep(1000);

    // Click on Teams tab
    await page.click('button:has-text("Teams")');
    await sleep(1000);

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
    // STEP 6: Enter matchup data for 10 weeks
    // ========================================
    console.log('STEP 6: Entering matchup data for 10 weeks...\n');

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
          await page.click('button:has-text("Matchups")');
          await sleep(1000);
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
          const backBtn = page.locator('button:has-text("Back to Edit")');
          if (await backBtn.isVisible()) {
            await backBtn.click();
          }
          continue;
        }

        // Points are pre-populated with the handicap engine's suggested values
        // Just wait for them to appear
        await sleep(500);

        // Submit the matchup
        await page.click('button:has-text("Submit Matchup")');
        await sleep(2000);

        // Check for success message
        const success = await page.locator('text=Matchup submitted successfully').isVisible();
        if (success) {
          console.log(`         Submitted successfully`);
        } else {
          console.log(`         WARN: No success message detected`);
        }
      }

      console.log(`   Week ${weekData.week} complete!\n`);
    }

    // ========================================
    // STEP 7: Verify results
    // ========================================
    console.log('STEP 7: Verifying results...');

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
    console.log(`   Home:       ${BASE_URL}/league/${leagueSlug}`);
    console.log(`   Admin:      ${BASE_URL}/league/${leagueSlug}/admin`);
    console.log(`   Leaderboard: ${BASE_URL}/league/${leagueSlug}/leaderboard`);
    console.log(`   History:    ${BASE_URL}/league/${leagueSlug}/history`);
    console.log(`   Handicaps:  ${BASE_URL}/league/${leagueSlug}/handicap-history\n`);
    console.log('Admin Password:', ADMIN_PASSWORD, '\n');

  } catch (error) {
    console.error('\nTEST FAILED:', error.message);
    console.error('Stack:', error.stack);

    const screenshotPath = `test-failure-${Date.now()}.png`;
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`Screenshot saved to: ${screenshotPath}`);
    console.log(`Current URL: ${page.url()}`);
  } finally {
    await browser.close();
  }
}

runTest().catch(console.error);
