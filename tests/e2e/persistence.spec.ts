import { test, expect } from '@playwright/test';

async function waitForContent(page) {
  await page.waitForSelector('.tessera-content');
  await page
    .waitForFunction(
      () => !document.querySelector('.tessera-loading-skeleton'),
      { timeout: 5000 },
    )
    .catch(() => {});
}

async function navigateToPage(page, pageTitle: string) {
  await page.locator('.tessera-nav-page', { hasText: pageTitle }).click();
  await waitForContent(page);
}

test.describe('Persistence — localStorage', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.goto('/');
    await waitForContent(page);
  });

  test('navigate to a page, reload → resumes on same page', async ({
    page,
  }) => {
    // Navigate to "Callouts & Images" (should be page index ~2)
    await navigateToPage(page, 'Callouts & Images');
    await expect(page.locator('.tessera-content h1')).toContainText(
      'Callouts & Images',
    );

    // Reload
    await page.reload();
    await waitForContent(page);

    // Should resume on the same page
    await expect(page.locator('.tessera-content h1')).toContainText(
      'Callouts & Images',
    );
  });

  test('visited pages survive reload — progress bar preserved', async ({
    page,
  }) => {
    // Visit several pages
    await navigateToPage(page, 'Objectives');
    await navigateToPage(page, 'Callouts & Images');
    await navigateToPage(page, 'Accordion & Carousel');

    // Read progress
    const progressLabel = page.locator('.tessera-progress-label');
    const textBefore = await progressLabel.textContent();
    const matchBefore = textBefore?.match(/(\d+) of (\d+)/);
    const visitedBefore = Number(matchBefore?.[1] || 0);
    expect(visitedBefore).toBeGreaterThanOrEqual(3); // welcome + visited pages

    // Reload
    await page.reload();
    await waitForContent(page);

    // Progress should be preserved
    const textAfter = await progressLabel.textContent();
    const matchAfter = textAfter?.match(/(\d+) of (\d+)/);
    const visitedAfter = Number(matchAfter?.[1] || 0);
    expect(visitedAfter).toBeGreaterThanOrEqual(visitedBefore);
  });

  test('clear localStorage → course starts fresh on new page load', async ({
    browser,
  }) => {
    // First context: visit some pages to build up state
    const ctx1 = await browser.newContext();
    const page1 = await ctx1.newPage();
    await page1.goto('/');
    await waitForContent(page1);
    await page1
      .locator('.tessera-nav-page', { hasText: 'Accordion & Carousel' })
      .click();
    await waitForContent(page1);
    await page1.close();
    await ctx1.close();

    // Second context: clear storage and verify fresh start
    const ctx2 = await browser.newContext();
    const page2 = await ctx2.newPage();
    await page2.goto('/');
    await page2.evaluate(() => localStorage.clear());
    await page2.goto('/');
    await waitForContent(page2);

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

    // Check localStorage
    const storageData = await page.evaluate(() => {
      const keys = Object.keys(localStorage);
      const tesseraKey = keys.find((k) => k.startsWith('tessera-'));
      if (!tesseraKey) return null;
      return JSON.parse(localStorage.getItem(tesseraKey)!);
    });

    expect(storageData).not.toBeNull();
    // Should have compact keys: b, v, q, d
    expect(storageData).toHaveProperty('b'); // bookmark
    expect(storageData).toHaveProperty('v'); // visited
    expect(storageData).toHaveProperty('q'); // quiz scores
    expect(storageData).toHaveProperty('d'); // duration
    expect(Array.isArray(storageData.v)).toBe(true);
    expect(storageData.v.length).toBeGreaterThanOrEqual(2);
  });

  test('quiz score persists across reload', async ({ page }) => {
    await navigateToPage(page, 'Graded Assessment');
    await page.waitForSelector('.tessera-quiz', { timeout: 10000 });

    const primaryBtn = page.locator('.tessera-quiz-nav .tessera-btn-primary');
    const progress = page.locator('.tessera-quiz-progress-desktop').first();

    // Q1: "2 + 2" → option index 1 ("4")
    await expect(progress).toContainText('Question 1 of 3');
    await page
      .locator('.tessera-quiz-question-wrapper.active .tessera-mc-option')
      .nth(1)
      .click();
    await expect(primaryBtn).toHaveText('Next');
    await primaryBtn.click(); // show feedback
    await expect(primaryBtn).toHaveText('Continue');
    await primaryBtn.click(); // advance

    // Q2: fill-in "blue"
    await expect(progress).toContainText('Question 2 of 3');
    await page
      .locator('.tessera-quiz-question-wrapper.active input[type="text"]')
      .fill('blue');
    await expect(primaryBtn).toHaveText('Next');
    await primaryBtn.click();
    await expect(primaryBtn).toHaveText('Continue');
    await primaryBtn.click();

    // Q3: matching, all correct
    await expect(progress).toContainText('Question 3 of 3');
    const activeQ = page.locator('.tessera-quiz-question-wrapper.active');
    const leftItems = activeQ.locator('.tessera-matching-item.left');
    const matched = activeQ.locator('.tessera-matching-item.left.matched');
    const matchMap = { '1': 'One', '2': 'Two', '3': 'Three' };
    const leftCount = await leftItems.count();
    let expectedMatches = 0;
    for (let i = 0; i < leftCount; i++) {
      const leftText = (await leftItems.nth(i).textContent())?.trim();
      const target = matchMap[leftText || ''];
      if (!target) continue;
      await leftItems.nth(i).click();
      await activeQ
        .locator('.tessera-matching-item.right', { hasText: target })
        .first()
        .click();
      expectedMatches++;
      await expect(matched).toHaveCount(expectedMatches);
    }

    await expect(primaryBtn).toHaveText('Check Answer');
    await primaryBtn.click();

    const submitBtn = page.locator('.tessera-quiz-btn-submit');
    await expect(submitBtn).toBeVisible();
    await submitBtn.click();
    await expect(page.locator('.tessera-quiz-results')).toBeVisible();

    // Verify quiz score is in localStorage
    const storageData = await page.evaluate(() => {
      const keys = Object.keys(localStorage);
      const tesseraKey = keys.find((k) => k.startsWith('tessera-'));
      if (!tesseraKey) return null;
      return JSON.parse(localStorage.getItem(tesseraKey)!);
    });
    expect(storageData).not.toBeNull();
    expect(Object.keys(storageData.q).length).toBeGreaterThanOrEqual(1);

    // Reload and verify state is restored
    await page.reload();
    await waitForContent(page);

    const restoredData = await page.evaluate(() => {
      const keys = Object.keys(localStorage);
      const tesseraKey = keys.find((k) => k.startsWith('tessera-'));
      if (!tesseraKey) return null;
      return JSON.parse(localStorage.getItem(tesseraKey)!);
    });
    expect(restoredData).not.toBeNull();
    expect(Object.keys(restoredData.q).length).toBeGreaterThanOrEqual(1);
  });

  test('state includes duration tracking', async ({ page }) => {
    // Persistence is event-driven: a save fires on each page change. Navigate
    // once to seed the store, sleep past the 1-second tick, then navigate
    // again to flush the updated duration. This avoids polling for a value
    // that only updates when something else triggers a save.
    await navigateToPage(page, 'Objectives');
    await page.waitForTimeout(1100);
    await navigateToPage(page, 'Callouts & Images');

    const storageData = await page.evaluate(() => {
      const tesseraKey = Object.keys(localStorage).find((k) =>
        k.startsWith('tessera-'),
      );
      return JSON.parse(localStorage.getItem(tesseraKey!)!);
    });
    expect(storageData).toHaveProperty('d');
    expect(storageData.d).toBeGreaterThanOrEqual(1);
    expect(storageData.b).toBeGreaterThanOrEqual(0);
  });
});
