import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// Helper: navigate to a page by clicking its sidebar button
async function navigateToPage(page, pageTitle: string) {
  // Click the page button in the sidebar nav
  await page.locator('.tessera-nav-page', { hasText: pageTitle }).click();
  // Wait for content to render
  await page.waitForTimeout(500);
}

test.describe('Component Accessibility', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.tessera-content');
  });

  test('Callout & Image page passes axe audit', async ({ page }) => {
    await navigateToPage(page, 'Callouts & Images');
    await page.waitForSelector('.tessera-callout');

    const results = await new AxeBuilder({ page })
      .include('.tessera-content')
      .analyze();

    expect(results.violations).toEqual([]);
  });

  test('Accordion & Carousel page passes axe audit', async ({ page }) => {
    await navigateToPage(page, 'Accordion & Carousel');
    await page.waitForSelector('.tessera-accordion');

    const results = await new AxeBuilder({ page })
      .include('.tessera-content')
      .analyze();

    expect(results.violations).toEqual([]);
  });

  test('Modal, Video & Audio page passes axe audit', async ({ page }) => {
    await navigateToPage(page, 'Modal, Video & Audio');
    await page.waitForSelector('.tessera-audio');

    const results = await new AxeBuilder({ page })
      .include('.tessera-content')
      .exclude('iframe') // Exclude third-party YouTube/Vimeo iframes
      .analyze();

    expect(results.violations).toEqual([]);
  });

  test('RevealModal passes axe audit when open', async ({ page }) => {
    await navigateToPage(page, 'Modal, Video & Audio');
    await page.waitForSelector('.tessera-reveal-trigger');

    // Open the modal and wait for animation to complete
    await page.locator('.tessera-reveal-trigger').click();
    await page.waitForSelector('[role="dialog"]');
    await page.waitForTimeout(500);

    const results = await new AxeBuilder({ page })
      .include('.tessera-modal-content')
      .analyze();

    expect(results.violations).toEqual([]);
  });
});

test.describe('Component Keyboard Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.tessera-content');
  });

  test('Accordion items toggle with Enter and Space', async ({ page }) => {
    await navigateToPage(page, 'Accordion & Carousel');
    await page.waitForSelector('.tessera-accordion');

    const firstTrigger = page.locator('.tessera-accordion-trigger').first();

    // Initially closed
    await expect(firstTrigger).toHaveAttribute('aria-expanded', 'false');

    // Focus and press Enter to open
    await firstTrigger.focus();
    await page.keyboard.press('Enter');
    await expect(firstTrigger).toHaveAttribute('aria-expanded', 'true');

    // Press Space to close
    await page.keyboard.press('Space');
    await expect(firstTrigger).toHaveAttribute('aria-expanded', 'false');
  });

  test('Carousel navigates with arrow keys', async ({ page }) => {
    await navigateToPage(page, 'Accordion & Carousel');
    await page.waitForSelector('.tessera-carousel');

    const carousel = page.locator('.tessera-carousel');
    await carousel.focus();

    // First dot should be active
    const activeDot = page.locator('.tessera-carousel-dot.active');
    await expect(activeDot).toHaveAttribute('aria-label', 'Go to slide 1');

    // Arrow right → slide 2
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('.tessera-carousel-dot.active')).toHaveAttribute('aria-label', 'Go to slide 2');

    // Arrow left → back to slide 1
    await page.keyboard.press('ArrowLeft');
    await expect(page.locator('.tessera-carousel-dot.active')).toHaveAttribute('aria-label', 'Go to slide 1');
  });

  test('RevealModal opens with click, closes with Escape', async ({ page }) => {
    await navigateToPage(page, 'Modal, Video & Audio');
    await page.waitForSelector('.tessera-reveal-trigger');

    // Open by clicking the trigger button
    await page.locator('.tessera-reveal-trigger button').click();
    await expect(page.locator('[role="dialog"]')).toBeVisible();

    // Close with Escape
    await page.keyboard.press('Escape');
    await expect(page.locator('[role="dialog"]')).not.toBeVisible();
  });

  test('RevealModal traps focus', async ({ page }) => {
    await navigateToPage(page, 'Modal, Video & Audio');
    await page.waitForSelector('.tessera-reveal-trigger');

    // Open modal
    await page.locator('.tessera-reveal-trigger').click();
    await page.waitForSelector('[role="dialog"]');

    // Tab multiple times — focus should remain inside modal
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('Tab');
    }

    // Verify focused element is inside the modal dialog
    const isInModal = await page.evaluate(() => {
      const active = document.activeElement;
      return !!active?.closest('[role="dialog"]') || !!active?.closest('.tessera-modal-overlay');
    });
    expect(isInModal).toBe(true);
  });
});

test.describe('Component Responsive Behavior', () => {
  test('components render at mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    await page.waitForSelector('.tessera-content');

    // Open hamburger to access nav
    const hamburger = page.locator('.tessera-hamburger');
    if (await hamburger.isVisible()) {
      await hamburger.click();
      await page.waitForTimeout(300);
    }

    await navigateToPage(page, 'Callouts & Images');
    await page.waitForSelector('.tessera-callout');

    // Callouts should be visible
    await expect(page.locator('.tessera-callout').first()).toBeVisible();
  });
});
