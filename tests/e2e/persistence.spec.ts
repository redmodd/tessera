import { test, expect } from '@playwright/test';
import {
  bfcacheRoundTrip,
  exitCourse,
  navigateToPage,
  readSavedState,
  waitForTesseraContent,
} from './helpers.js';

test.describe('Persistence — localStorage', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.install();
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.goto('/');
    await waitForTesseraContent(page);
  });

  test('navigate to a page, reload → resumes on same page', async ({
    page,
  }) => {
    // Navigate to "Callouts & Images" (should be page index ~2)
    await navigateToPage(page, 'Callouts & Images');

    // Reload
    await page.reload();
    await waitForTesseraContent(page);

    // Should resume on the same page
    await expect(page.locator('.tessera-content h1')).toContainText(
      'Callouts & Images',
    );
  });

  test('visited pages survive reload — progress bar preserved', async ({
    page,
  }) => {
    await navigateToPage(page, 'Objectives');
    await navigateToPage(page, 'Callouts & Images');
    await navigateToPage(page, 'Accordion & Carousel');

    // Welcome plus the three visited pages
    const progressLabel = page.locator('.tessera-progress-label');
    await expect(progressLabel).toContainText(/4 of \d+ pages/);

    await page.reload();
    await waitForTesseraContent(page);

    await expect(progressLabel).toContainText(/4 of \d+ pages/);
  });

  test('clear localStorage → course starts fresh on new page load', async ({
    browser,
  }) => {
    // First context: visit some pages to build up state
    const ctx1 = await browser.newContext();
    const page1 = await ctx1.newPage();
    await page1.goto('/');
    await waitForTesseraContent(page1);
    await navigateToPage(page1, 'Accordion & Carousel');
    await page1.close();
    await ctx1.close();

    // Second context: clear storage and verify fresh start
    const ctx2 = await browser.newContext();
    const page2 = await ctx2.newPage();
    await page2.goto('/');
    await page2.evaluate(() => localStorage.clear());
    await page2.goto('/');
    await waitForTesseraContent(page2);

    // Should be on first page (Welcome) since no saved state
    await expect(page2.locator('.tessera-content h1')).toContainText(
      'Welcome',
      { timeout: 10000 },
    );

    // Progress should be 1 (only current page)
    const progressLabel = page2.locator('.tessera-progress-label');
    await expect(progressLabel).toContainText(/1 of \d+ pages/);
    await page2.close();
    await ctx2.close();
  });

  test('localStorage contains compact serialized state', async ({ page }) => {
    await navigateToPage(page, 'Objectives');
    await navigateToPage(page, 'Callouts & Images');

    const storageData = await readSavedState(page);

    expect(storageData).not.toBeNull();
    expect(storageData).toHaveProperty('b'); // bookmark
    expect(storageData).toHaveProperty('v'); // visited
    expect(storageData).toHaveProperty('d'); // duration
    expect(Array.isArray(storageData.v)).toBe(true);
    expect(storageData.v.length).toBeGreaterThanOrEqual(2);
  });

  test('state includes duration tracking', async ({ page }) => {
    // Persistence is event-driven: a save fires on each page change. Navigate
    // once to seed the store, fast-forward past the 1-second tick, then navigate
    // again to flush the updated duration. This avoids polling for a value
    // that only updates when something else triggers a save.
    await navigateToPage(page, 'Objectives');
    await page.clock.fastForward(1_100);
    await navigateToPage(page, 'Callouts & Images');

    const storageData = await readSavedState(page);
    expect(storageData).toHaveProperty('d');
    expect(storageData.d).toBeGreaterThanOrEqual(1);
    expect(storageData.b).toBeGreaterThanOrEqual(0);
  });

  test('a page restored from the back/forward cache saves again when the learner leaves', async ({
    page,
  }) => {
    await expect(page.locator('.tessera-content h1')).toBeVisible();
    await bfcacheRoundTrip(page);
    const restored = (await readSavedState(page)).d;
    await page.clock.fastForward(5_000);
    await exitCourse(page);

    expect((await readSavedState(page)).d).toBeGreaterThanOrEqual(restored + 5);
  });
});
