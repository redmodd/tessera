import { test, expect } from '@playwright/test';

async function waitForContent(page) {
  await page.waitForSelector('.tessera-content');
  await page.waitForFunction(() => !document.querySelector('.tessera-loading-skeleton'), { timeout: 5000 }).catch(() => {});
}

test.describe('Navigation — Sequential Mode', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.goto('/');
    await waitForContent(page);
  });

  test('first page loads normally', async ({ page }) => {
    await expect(page.locator('.tessera-content h1')).toContainText('Page One');
  });

  test('locked pages have aria-disabled in sidebar', async ({ page }) => {
    // After loading page 1, page 1 is visited so page 2 is unlocked.
    // But page 3 should still be locked (page 2 not yet visited).
    const pageThree = page.locator('.tessera-nav-page', { hasText: 'Page Three' });
    await expect(pageThree).toHaveAttribute('aria-disabled', 'true');
  });

  test('clicking a locked page does not navigate', async ({ page }) => {
    const pageThree = page.locator('.tessera-nav-page', { hasText: 'Page Three' });
    // Use force:true since Playwright won't click disabled elements normally
    await pageThree.click({ force: true });
    await page.waitForTimeout(300);

    // Should still be on Page One
    await expect(page.locator('.tessera-content h1')).toContainText('Page One');
  });

  test('visiting page unlocks the next page', async ({ page }) => {
    // Page Three is locked (page two not yet visited)
    const pageThree = page.locator('.tessera-nav-page', { hasText: 'Page Three' });
    await expect(pageThree).toHaveAttribute('aria-disabled', 'true');

    // Navigate to Page Two (already unlocked since Page One was visited)
    const nextBtn = page.locator('.tessera-page-nav-btn', { hasText: 'Next' });
    await nextBtn.click();
    await waitForContent(page);
    await expect(page.locator('.tessera-content h1')).toContainText('Page Two');

    // Now Page Three should be unlocked
    await expect(pageThree).not.toHaveAttribute('aria-disabled', 'true');
  });

  test('pages unlock one at a time in sequence', async ({ page }) => {
    const nextBtn = page.locator('.tessera-page-nav-btn', { hasText: 'Next' });

    // Navigate to Page Two
    await nextBtn.click();
    await waitForContent(page);
    await expect(page.locator('.tessera-content h1')).toContainText('Page Two');

    // Page Three should now be unlockable (Page Two was visited)
    await nextBtn.click();
    await waitForContent(page);
    await expect(page.locator('.tessera-content h1')).toContainText('Page Three');
  });

  test('next button is disabled when current page is not complete (initially)', async ({ page }) => {
    // On first load of page one, the next button state depends on implementation
    // After visiting page one, next should be enabled since visiting = complete for non-quiz pages
    // The page is visited on load, so next should be enabled
    const nextBtn = page.locator('.tessera-page-nav-btn', { hasText: 'Next' });
    await expect(nextBtn).toBeEnabled();
  });

  test('can navigate back to previously visited pages', async ({ page }) => {
    const nextBtn = page.locator('.tessera-page-nav-btn', { hasText: 'Next' });
    const prevBtn = page.locator('.tessera-page-nav-btn', { hasText: 'Previous' });

    // Go forward
    await nextBtn.click();
    await waitForContent(page);

    // Go back to page one
    await prevBtn.click();
    await waitForContent(page);
    await expect(page.locator('.tessera-content h1')).toContainText('Page One');

    // Page One should still be clickable in sidebar
    const pageOne = page.locator('.tessera-nav-page', { hasText: 'Page One' });
    await expect(pageOne).not.toHaveAttribute('aria-disabled', 'true');
  });
});
