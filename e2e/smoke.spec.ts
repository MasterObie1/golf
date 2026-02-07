import { test, expect } from "@playwright/test";

/**
 * Smoke tests — verify core user flows work end-to-end.
 * These tests run against a local dev server (or BASE_URL if set).
 *
 * Prerequisites:
 *   - A running dev server (playwright.config.ts auto-starts one)
 *   - A clean or seeded database
 */

test.describe("League creation flow", () => {
  const leagueName = `E2E Test League ${Date.now()}`;

  test("home page loads", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/LeagueLinks|Golf/i);
  });

  test("leagues page loads", async ({ page }) => {
    await page.goto("/leagues");
    await expect(page.locator("h1")).toBeVisible();
  });

  test("create league page loads", async ({ page }) => {
    await page.goto("/leagues/new");
    await expect(page.locator("input#name")).toBeVisible();
  });

  test("can create a new league", async ({ page }) => {
    await page.goto("/leagues/new");

    await page.fill("input#name", leagueName);
    await page.fill("input#password", "e2etestpass123");
    await page.fill("input#confirmPassword", "e2etestpass123");
    await page.click('button[type="submit"]');

    // Should see success page
    await expect(page.locator("text=League Created")).toBeVisible({ timeout: 15000 });
  });
});

test.describe("Admin login flow", () => {
  // This test suite requires a league to exist.
  // We use a well-known test league or create one in a beforeAll.
  let leagueSlug: string;
  const password = "e2etestadmin123";

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();

    const name = `Admin E2E ${Date.now()}`;
    await page.goto("/leagues/new");
    await page.fill("input#name", name);
    await page.fill("input#password", password);
    await page.fill("input#confirmPassword", password);
    await page.click('button[type="submit"]');

    await page.waitForSelector("text=League Created", { timeout: 15000 });

    // Extract slug from the admin login link
    const link = await page.getAttribute('a[href*="/admin/login"]', "href");
    leagueSlug = link!.split("/league/")[1].split("/admin")[0];
    await page.close();
  });

  test("admin login page loads", async ({ page }) => {
    await page.goto(`/league/${leagueSlug}/admin/login`);
    await expect(page.locator("#password")).toBeVisible();
  });

  test("rejects invalid credentials", async ({ page }) => {
    await page.goto(`/league/${leagueSlug}/admin/login`);
    await page.fill("#password", "wrong");
    await page.click('button[type="submit"]');

    // Should show error (not redirect to admin)
    await expect(page.locator("text=Invalid")).toBeVisible({ timeout: 5000 });
  });

  test("accepts valid credentials", async ({ page }) => {
    await page.goto(`/league/${leagueSlug}/admin/login`);
    await page.fill("#password", password);
    await page.click('button[type="submit"]');

    // Should redirect to admin dashboard
    await page.waitForURL(`**/league/${leagueSlug}/admin`, { timeout: 15000 });
    await expect(page.locator("text=Admin")).toBeVisible();
  });
});

test.describe("Public pages", () => {
  let leagueSlug: string;

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    const name = `Public E2E ${Date.now()}`;
    await page.goto("/leagues/new");
    await page.fill("input#name", name);
    await page.fill("input#password", "publictest1234");
    await page.fill("input#confirmPassword", "publictest1234");
    await page.click('button[type="submit"]');
    await page.waitForSelector("text=League Created", { timeout: 15000 });
    const link = await page.getAttribute('a[href*="/admin/login"]', "href");
    leagueSlug = link!.split("/league/")[1].split("/admin")[0];
    await page.close();
  });

  test("league home page loads", async ({ page }) => {
    await page.goto(`/league/${leagueSlug}`);
    await expect(page.locator("h1")).toBeVisible();
  });

  test("signup page loads", async ({ page }) => {
    await page.goto(`/league/${leagueSlug}/signup`);
    await expect(page.locator("form")).toBeVisible();
  });

  test("leaderboard page loads", async ({ page }) => {
    await page.goto(`/league/${leagueSlug}/leaderboard`);
    await expect(page.locator("h1")).toContainText(/Leaderboard/i);
  });

  test("history page loads", async ({ page }) => {
    await page.goto(`/league/${leagueSlug}/history`);
    await expect(page.locator("h1")).toContainText(/History/i);
  });

  test("handicap history page loads", async ({ page }) => {
    await page.goto(`/league/${leagueSlug}/handicap-history`);
    await expect(page.locator("h1")).toContainText(/Handicap/i);
  });

  test("non-existent league returns 404", async ({ page }) => {
    const response = await page.goto("/league/nonexistent-league-slug-12345");
    expect(response?.status()).toBe(404);
  });
});
