import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// Helper: wait for page content to load after navigation
async function waitForContent(page) {
  await page.waitForSelector('.tessera-content');
  // Wait for loading skeleton to disappear
  await page
    .waitForFunction(
      () => !document.querySelector('.tessera-loading-skeleton'),
      { timeout: 5000 },
    )
    .catch(() => {});
}

// Helper: navigate via sidebar
async function clickSidebarPage(page, pageTitle: string) {
  await page.locator('.tessera-nav-page', { hasText: pageTitle }).click();
  await waitForContent(page);
}

test.describe('Navigation — Free Mode', () => {
  test.beforeEach(async ({ page }) => {
    // Clear localStorage to start fresh
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.goto('/');
    await waitForContent(page);
  });

  test('loads first page on initial visit', async ({ page }) => {
    await expect(page.locator('.tessera-content h1')).toContainText('Welcome');
  });

  test('sidebar shows all sections and pages', async ({ page }) => {
    // Check sections exist
    await expect(
      page.locator('.tessera-nav-section-title', { hasText: 'Introduction' }),
    ).toBeVisible();
    await expect(
      page.locator('.tessera-nav-section-title', { hasText: 'Components' }),
    ).toBeVisible();
    await expect(
      page.locator('.tessera-nav-section-title', { hasText: 'Assessment' }),
    ).toBeVisible();
  });

  test('clicking a sidebar page loads that page content', async ({ page }) => {
    await clickSidebarPage(page, 'Objectives');
    await expect(page.locator('.tessera-content h1')).toContainText(
      'Course Objectives',
    );
  });

  test('can click any page in free mode — no locking', async ({ page }) => {
    // Should be able to jump directly to a later page
    await clickSidebarPage(page, 'Accordion & Carousel');
    await expect(page.locator('.tessera-content h1')).toContainText(
      'Accordion & Carousel',
    );

    // Jump back to an earlier page
    await clickSidebarPage(page, 'Welcome');
    await expect(page.locator('.tessera-content h1')).toContainText('Welcome');
  });

  test('prev button is disabled on first page', async ({ page }) => {
    const prevBtn = page.locator('.tessera-page-nav-btn', {
      hasText: 'Previous',
    });
    await expect(prevBtn).toBeDisabled();
  });

  test('next button navigates to the next page', async ({ page }) => {
    const nextBtn = page.locator('.tessera-page-nav-btn', { hasText: 'Next' });
    await expect(nextBtn).toBeEnabled();
    await nextBtn.click();
    await waitForContent(page);
    await expect(page.locator('.tessera-content h1')).toContainText(
      'Course Objectives',
    );
  });

  test('prev/next navigate through all pages end-to-end', async ({ page }) => {
    const nextBtn = page.locator('.tessera-page-nav-btn', { hasText: 'Next' });
    const prevBtn = page.locator('.tessera-page-nav-btn', {
      hasText: 'Previous',
    });

    // Navigate forward a few pages
    await nextBtn.click(); // Page 2
    await waitForContent(page);
    await nextBtn.click(); // Page 3
    await waitForContent(page);
    await expect(page.locator('.tessera-content h1')).toContainText(
      'Callouts & Images',
    );

    // Navigate back
    await prevBtn.click(); // Page 2
    await waitForContent(page);
    await expect(page.locator('.tessera-content h1')).toContainText(
      'Course Objectives',
    );
  });

  test('next button is disabled when further progress is gated', async ({
    page,
  }) => {
    // Navigate to the graded quiz page (has gatesProgress: true)
    // The page after it is locked until the quiz is passed
    await clickSidebarPage(page, 'Graded Assessment');
    const nextBtn = page.locator('.tessera-page-nav-btn', { hasText: 'Next' });
    // Next should be disabled — the quiz gates progress and hasn't been passed
    await expect(nextBtn).toBeDisabled();
  });

  test('current page is highlighted in sidebar', async ({ page }) => {
    // The first page should have aria-current
    const activePage = page.locator('.tessera-nav-page[aria-current="page"]');
    await expect(activePage).toContainText('Welcome');

    // Navigate and check highlight moves
    await clickSidebarPage(page, 'Objectives');
    const newActive = page.locator('.tessera-nav-page[aria-current="page"]');
    await expect(newActive).toContainText('Objectives');
  });

  test('progress bar updates as pages are visited', async ({ page }) => {
    const progressLabel = page.locator('.tessera-progress-label');
    await expect(progressLabel).toContainText(/\d+ of \d+ pages/);

    await clickSidebarPage(page, 'Objectives');

    // Progress should reflect at least 2 visited pages — poll the label rather
    // than sleeping, since the update is reactive.
    await expect
      .poll(async () => {
        const text = await progressLabel.textContent();
        const match = text?.match(/(\d+) of (\d+)/);
        return match ? Number(match[1]) : 0;
      })
      .toBeGreaterThanOrEqual(2);
  });
});

test.describe('Navigation — Keyboard Shortcuts', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.goto('/');
    await waitForContent(page);
  });

  test('ArrowRight navigates to next page', async ({ page }) => {
    await page.keyboard.press('ArrowRight');
    await waitForContent(page);
    await expect(page.locator('.tessera-content h1')).toContainText(
      'Course Objectives',
    );
  });

  test('ArrowLeft navigates to previous page', async ({ page }) => {
    // Go to page 2 first
    await page.keyboard.press('ArrowRight');
    await waitForContent(page);

    // Go back
    await page.keyboard.press('ArrowLeft');
    await waitForContent(page);
    await expect(page.locator('.tessera-content h1')).toContainText('Welcome');
  });

  test('ArrowLeft does nothing on first page', async ({ page }) => {
    await page.keyboard.press('ArrowLeft');
    await waitForContent(page);
    // Should still be on page 1
    await expect(page.locator('.tessera-content h1')).toContainText('Welcome');
  });

  test('arrow keys are ignored when focus is in an input', async ({ page }) => {
    // Navigate to inline questions page which has inputs
    await clickSidebarPage(page, 'Graded Assessment');
    await waitForContent(page);

    // The quiz page should be visible - find a text input if any
    // Focus on an input element — FillInTheBlank has text input
    // First navigate to the fill-in-the-blank question
    const content = page.locator('.tessera-content');
    await expect(content).toBeVisible();

    // If there's a radio input, focus it and verify arrow keys don't navigate pages
    const radioInput = page.locator('input[type="radio"]').first();
    if (await radioInput.isVisible()) {
      await radioInput.focus();
      const h1Before = await page.locator('.tessera-content h1').textContent();
      await page.keyboard.press('ArrowRight');
      // Small wait to see if navigation happens
      await page.waitForTimeout(300);
      const h1After = await page.locator('.tessera-content h1').textContent();
      expect(h1After).toBe(h1Before);
    }
  });
});

test.describe('Navigation — Accessibility', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.goto('/');
    await waitForContent(page);
  });

  test('sidebar passes axe audit', async ({ page }) => {
    const results = await new AxeBuilder({ page })
      .include('.tessera-sidebar')
      .analyze();
    expect(results.violations).toEqual([]);
  });

  test('full page (welcome) passes axe audit', async ({ page }) => {
    const results = await new AxeBuilder({ page })
      // Iframes embed third-party content we don't control.
      .exclude('iframe')
      .analyze();
    expect(results.violations).toEqual([]);
  });
});
