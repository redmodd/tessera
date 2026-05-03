import { test, expect } from '@playwright/test';

// Mobile viewport is set by playwright project config (375x667)

async function waitForContent(page) {
  await page.waitForSelector('.tessera-content');
  await page.waitForFunction(() => !document.querySelector('.tessera-loading-skeleton'), { timeout: 5000 }).catch(() => {});
}

test.describe('Mobile Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.goto('/');
    await waitForContent(page);
  });

  test('hamburger button is visible on mobile', async ({ page }) => {
    const hamburger = page.locator('.tessera-hamburger');
    await expect(hamburger).toBeVisible();
  });

  test('sidebar is hidden by default on mobile', async ({ page }) => {
    const sidebar = page.locator('.tessera-sidebar');
    // Sidebar should not be in "open" state
    await expect(sidebar).not.toHaveClass(/open/);
  });

  test('hamburger opens sidebar overlay', async ({ page }) => {
    const hamburger = page.locator('.tessera-hamburger');
    await hamburger.click();
    await expect(page.locator('.tessera-sidebar')).toHaveClass(/open/);
  });

  test('selecting a page closes sidebar and loads content', async ({ page }) => {
    // Open sidebar
    const hamburger = page.locator('.tessera-hamburger');
    await hamburger.click();
    await expect(page.locator('.tessera-sidebar')).toHaveClass(/open/);

    // Click a page
    await page.locator('.tessera-nav-page', { hasText: 'Objectives' }).click();
    await waitForContent(page);

    // Sidebar should close
    const sidebar = page.locator('.tessera-sidebar');
    await expect(sidebar).not.toHaveClass(/open/);

    // Content should update
    await expect(page.locator('.tessera-content h1')).toContainText('Course Objectives');
  });

  test('prev/next buttons work on mobile', async ({ page }) => {
    const nextBtn = page.locator('.tessera-page-nav-btn', { hasText: 'Next' });
    await expect(nextBtn).toBeVisible();
    await nextBtn.click();
    await waitForContent(page);
    await expect(page.locator('.tessera-content h1')).toContainText('Course Objectives');

    const prevBtn = page.locator('.tessera-page-nav-btn', { hasText: 'Previous' });
    await prevBtn.click();
    await waitForContent(page);
    await expect(page.locator('.tessera-content h1')).toContainText('Welcome');
  });

  test('progress bar is visible on mobile', async ({ page }) => {
    const progress = page.locator('.tessera-progress');
    await expect(progress).toBeVisible();
  });

  test('carousel responds to swipe gesture on mobile', async ({ page }) => {
    // Open sidebar and navigate to carousel page
    const hamburger = page.locator('.tessera-hamburger');
    await hamburger.click();
    await expect(page.locator('.tessera-sidebar')).toHaveClass(/open/);

    await page.locator('.tessera-nav-page', { hasText: 'Accordion & Carousel' }).click();
    await waitForContent(page);
    await page.waitForSelector('.tessera-carousel');

    // First dot should be active (slide 1)
    const dots = page.locator('.tessera-carousel-dot');
    await expect(dots.nth(0)).toHaveClass(/active/);

    // Simulate swipe left via JavaScript touch events on the carousel element
    await page.evaluate(() => {
      const el = document.querySelector('.tessera-carousel')!;
      const startX = 300;
      const endX = 50; // swipe left by 250px (> 50px threshold)

      const touchStart = new Touch({ identifier: 1, target: el, screenX: startX, screenY: 200, clientX: startX, clientY: 200 });
      const touchEnd = new Touch({ identifier: 1, target: el, screenX: endX, screenY: 200, clientX: endX, clientY: 200 });

      el.dispatchEvent(new TouchEvent('touchstart', {
        bubbles: true,
        cancelable: true,
        changedTouches: [touchStart],
        touches: [touchStart],
      }));
      el.dispatchEvent(new TouchEvent('touchend', {
        bubbles: true,
        cancelable: true,
        changedTouches: [touchEnd],
        touches: [],
      }));
    });

    // Should advance to slide 2 — `expect` polls automatically.
    await expect(dots.nth(1)).toHaveClass(/active/);
  });

  test('components render correctly at mobile viewport', async ({ page }) => {
    // Open sidebar and navigate to component page
    const hamburger = page.locator('.tessera-hamburger');
    await hamburger.click();
    await expect(page.locator('.tessera-sidebar')).toHaveClass(/open/);

    await page.locator('.tessera-nav-page', { hasText: 'Callouts & Images' }).click();
    await waitForContent(page);
    await page.waitForSelector('.tessera-callout');

    // All callouts should be visible
    const callouts = page.locator('.tessera-callout');
    const count = await callouts.count();
    expect(count).toBeGreaterThanOrEqual(4);
    for (let i = 0; i < count; i++) {
      await expect(callouts.nth(i)).toBeVisible();
    }
  });
});
