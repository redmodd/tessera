import { test, expect } from '@playwright/test';
import { waitForTesseraContent } from './helpers.js';

// Mobile viewport is set by playwright project config (375x667)

test.describe('Mobile Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.goto('/');
    await waitForTesseraContent(page);
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

  test('Escape closes the sidebar from inside an arrow-key widget', async ({
    page,
  }) => {
    await page.locator('.tessera-hamburger').click();
    await expect(page.locator('.tessera-sidebar')).toHaveClass(/open/);

    await page.evaluate(() => {
      const toolbar = document.createElement('div');
      toolbar.setAttribute('role', 'toolbar');
      document.querySelector('.tessera-content')!.append(toolbar);
      toolbar.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'Escape',
          shiftKey: true,
          bubbles: true,
          cancelable: true,
        }),
      );
    });
    await expect(page.locator('.tessera-sidebar')).not.toHaveClass(/open/);
  });

  test('the closed sidebar is out of the Tab order', async ({ page }) => {
    await page.locator('.tessera-hamburger').focus();
    await page.keyboard.press('Tab');
    await expect(page.locator('.tessera-main :focus')).toHaveCount(1);
  });

  test('the open sidebar holds focus and Escape returns it to the menu button', async ({
    page,
  }) => {
    const hamburger = page.locator('.tessera-hamburger');
    await hamburger.click();
    await expect(
      page.locator('.tessera-nav-page[aria-current="page"]'),
    ).toBeFocused();

    // Past either end, focus leaves the document (body here, browser chrome
    // in a real browser), as from a native modal dialog.
    const inSidebarOrOut = () => {
      const el = document.activeElement!;
      return (
        el === document.body ||
        !!el.closest('.tessera-sidebar, .tessera-hamburger')
      );
    };
    const stops = await page.locator('.tessera-sidebar button').count();
    for (const key of ['Tab', 'Shift+Tab']) {
      for (let i = 0; i < stops + 2; i++) {
        await page.keyboard.press(key);
        expect(await page.evaluate(inSidebarOrOut)).toBe(true);
      }
    }

    await page.locator('.tessera-sidebar button').first().focus();
    await page.keyboard.press('Escape');
    await expect(page.locator('.tessera-sidebar')).not.toHaveClass(/open/);
    await expect(hamburger).toBeFocused();
    await expect(hamburger).toHaveCSS('outline-style', 'solid');
    await expect(hamburger).toHaveCSS(
      'box-shadow',
      'rgb(255, 255, 255) 0px 0px 0px 4px',
    );
  });

  test('Tab right after closing skips the sliding-out sidebar', async ({
    page,
  }) => {
    await page.locator('.tessera-hamburger').click();
    await expect(
      page.locator('.tessera-nav-page[aria-current="page"]'),
    ).toBeFocused();
    await page.keyboard.press('Escape');
    await page.keyboard.press('Tab');
    await expect(page.locator('.tessera-main :focus')).toHaveCount(1);
  });

  test('closing the sidebar from the overlay or the current page returns focus to the menu button', async ({
    page,
  }) => {
    const hamburger = page.locator('.tessera-hamburger');
    await hamburger.click();
    await page
      .locator('.tessera-sidebar-overlay')
      .click({ position: { x: 360, y: 300 } });
    await expect(hamburger).toBeFocused();

    await hamburger.click();
    await page.locator('.tessera-nav-page', { hasText: 'Welcome' }).click();
    await expect(page.locator('.tessera-sidebar')).not.toHaveClass(/open/);
    await expect(hamburger).toBeFocused();
  });

  test('leaving the overlay width closes the sidebar', async ({ page }) => {
    await page.locator('.tessera-hamburger').click();
    await page.setViewportSize({ width: 1280, height: 800 });
    await expect(page.locator('.tessera-sidebar')).not.toHaveClass(/open/);
    await expect(page.locator('.tessera-main')).not.toHaveAttribute('inert');

    await page.locator('.tessera-nav-page').nth(1).focus();
    await page.setViewportSize({ width: 375, height: 667 });
    await expect(page.locator('.tessera-hamburger')).toBeFocused();
  });

  test('the skip link does not cover the menu button', async ({ page }) => {
    await page.keyboard.press('Tab');
    const skip = page.getByRole('link', { name: 'Skip to content' });
    await expect(skip).toBeFocused();
    const link = (await skip.boundingBox())!;
    const menu = (await page.locator('.tessera-hamburger').boundingBox())!;
    expect(link.x).toBeGreaterThanOrEqual(menu.x + menu.width);
  });

  test('selecting a page closes sidebar and loads content', async ({
    page,
  }) => {
    // Open sidebar
    const hamburger = page.locator('.tessera-hamburger');
    await hamburger.click();
    await expect(page.locator('.tessera-sidebar')).toHaveClass(/open/);

    // Click a page
    await page.locator('.tessera-nav-page', { hasText: 'Objectives' }).click();

    // Sidebar should close
    const sidebar = page.locator('.tessera-sidebar');
    await expect(sidebar).not.toHaveClass(/open/);

    // Content should update
    await expect(page.locator('.tessera-content h1')).toContainText(
      'Course Objectives',
    );
    await expect(page.locator('.tessera-content h1')).toBeFocused();
  });

  test('prev/next buttons work on mobile', async ({ page }) => {
    const nextBtn = page.locator('.tessera-page-nav-btn', { hasText: 'Next' });
    await expect(nextBtn).toBeVisible();
    await nextBtn.click();
    await expect(page.locator('.tessera-content h1')).toContainText(
      'Course Objectives',
    );

    const prevBtn = page.locator('.tessera-page-nav-btn', {
      hasText: 'Previous',
    });
    await prevBtn.click();
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

    await page
      .locator('.tessera-nav-page', { hasText: 'Accordion & Carousel' })
      .click();
    await page.waitForSelector('.tessera-carousel');

    // First dot should be active (slide 1)
    const dots = page.locator('.tessera-carousel-dot');
    await expect(dots.nth(0)).toHaveClass(/active/);

    // Simulate swipe left via JavaScript touch events on the carousel element
    await page.evaluate(() => {
      const el = document.querySelector('.tessera-carousel')!;
      const startX = 300;
      const endX = 50; // swipe left by 250px (> 50px threshold)

      const touchStart = new Touch({
        identifier: 1,
        target: el,
        screenX: startX,
        screenY: 200,
        clientX: startX,
        clientY: 200,
      });
      const touchEnd = new Touch({
        identifier: 1,
        target: el,
        screenX: endX,
        screenY: 200,
        clientX: endX,
        clientY: 200,
      });

      el.dispatchEvent(
        new TouchEvent('touchstart', {
          bubbles: true,
          cancelable: true,
          changedTouches: [touchStart],
          touches: [touchStart],
        }),
      );
      el.dispatchEvent(
        new TouchEvent('touchend', {
          bubbles: true,
          cancelable: true,
          changedTouches: [touchEnd],
          touches: [],
        }),
      );
    });

    // Should advance to slide 2 — `expect` polls automatically.
    await expect(dots.nth(1)).toHaveClass(/active/);
  });

  test('components render correctly at mobile viewport', async ({ page }) => {
    // Open sidebar and navigate to component page
    const hamburger = page.locator('.tessera-hamburger');
    await hamburger.click();
    await expect(page.locator('.tessera-sidebar')).toHaveClass(/open/);

    await page
      .locator('.tessera-nav-page', { hasText: 'Callouts & Images' })
      .click();
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
