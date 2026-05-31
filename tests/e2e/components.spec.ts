import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

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

test.describe('Component — Accordion', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.goto('/');
    await waitForContent(page);
    await navigateToPage(page, 'Accordion & Carousel');
    await page.waitForSelector('.tessera-accordion');
  });

  test('accordion items toggle with click', async ({ page }) => {
    const firstTrigger = page.locator('.tessera-accordion-trigger').first();

    // Initially closed
    await expect(firstTrigger).toHaveAttribute('aria-expanded', 'false');

    // Click to open
    await firstTrigger.click();
    await expect(firstTrigger).toHaveAttribute('aria-expanded', 'true');

    // Click again to close
    await firstTrigger.click();
    await expect(firstTrigger).toHaveAttribute('aria-expanded', 'false');
  });

  test('only one accordion item open at a time', async ({ page }) => {
    const triggers = page.locator('.tessera-accordion-trigger');

    // Open first item
    await triggers.nth(0).click();
    await expect(triggers.nth(0)).toHaveAttribute('aria-expanded', 'true');

    // Open second item — first should close
    await triggers.nth(1).click();
    await expect(triggers.nth(1)).toHaveAttribute('aria-expanded', 'true');
    await expect(triggers.nth(0)).toHaveAttribute('aria-expanded', 'false');
  });

  test('accordion keyboard navigation — Enter and Space', async ({ page }) => {
    const firstTrigger = page.locator('.tessera-accordion-trigger').first();

    await firstTrigger.focus();
    await page.keyboard.press('Enter');
    await expect(firstTrigger).toHaveAttribute('aria-expanded', 'true');

    await page.keyboard.press('Space');
    await expect(firstTrigger).toHaveAttribute('aria-expanded', 'false');
  });
});

test.describe('Component — Carousel', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.goto('/');
    await waitForContent(page);
    await navigateToPage(page, 'Accordion & Carousel');
    await page.waitForSelector('.tessera-carousel');
  });

  test('carousel shows first slide and navigation dots', async ({ page }) => {
    const dots = page.locator('.tessera-carousel-dot');
    const dotCount = await dots.count();
    expect(dotCount).toBe(3);

    // First dot should be active
    await expect(dots.nth(0)).toHaveClass(/active/);
  });

  test('carousel prev/next buttons navigate slides', async ({ page }) => {
    const nextArrow = page
      .locator(
        '.tessera-carousel-next, [aria-label*="next" i], [aria-label*="Next"]',
      )
      .first();
    const dots = page.locator('.tessera-carousel-dot');

    if (await nextArrow.isVisible()) {
      await nextArrow.click();
      await expect(dots.nth(1)).toHaveClass(/active/);
    }
  });

  test('carousel keyboard navigation with arrow keys', async ({ page }) => {
    const carousel = page.locator('.tessera-carousel');
    await carousel.focus();

    const dots = page.locator('.tessera-carousel-dot');

    await page.keyboard.press('ArrowRight');
    await expect(dots.nth(1)).toHaveClass(/active/);

    await page.keyboard.press('ArrowLeft');
    await expect(dots.nth(0)).toHaveClass(/active/);
  });
});

test.describe('Component — RevealModal', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.goto('/');
    await waitForContent(page);
    await navigateToPage(page, 'Modal, Video & Audio');
    await page.waitForSelector('.tessera-reveal-trigger');
  });

  test('clicking trigger opens modal', async ({ page }) => {
    await page.locator('.tessera-reveal-trigger').click();
    await expect(page.getByRole('dialog')).toBeVisible();
  });

  test('Escape closes modal', async ({ page }) => {
    await page.locator('.tessera-reveal-trigger').click();
    await expect(page.getByRole('dialog')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).not.toBeVisible();
  });

  test('focus is trapped inside modal', async ({ page }) => {
    await page.locator('.tessera-reveal-trigger').click();
    await expect(page.getByRole('dialog')).toBeVisible();

    // Tab several times — focus should stay inside modal
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('Tab');
    }

    const isInModal = await page.evaluate(
      () => !!document.activeElement?.closest('dialog.tessera-modal'),
    );
    expect(isInModal).toBe(true);
  });

  test('clicking the backdrop closes it', async ({ page }) => {
    await page.locator('.tessera-reveal-trigger').click();
    await expect(page.getByRole('dialog')).toBeVisible();

    // The centered <dialog> box doesn't reach the viewport corner; a click
    // there lands on the ::backdrop, whose target is the dialog element.
    await page.mouse.click(5, 5);
    await expect(page.getByRole('dialog')).not.toBeVisible();
  });
});

test.describe('Component Accessibility', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.goto('/');
    await waitForContent(page);
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
      .exclude('iframe')
      .analyze();

    expect(results.violations).toEqual([]);
  });

  test('RevealModal passes axe audit when open', async ({ page }) => {
    await navigateToPage(page, 'Modal, Video & Audio');
    await page.waitForSelector('.tessera-reveal-trigger');

    await page.locator('.tessera-reveal-trigger').click();
    const dialog = page.getByRole('dialog');
    const content = page.locator('.tessera-modal-content');
    await expect(dialog).toBeVisible();
    // The fade-in animation interpolates opacity from 0→1 over 200ms; wait for
    // it to settle so axe doesn't read mid-animation colors as low-contrast.
    await expect(content).toHaveCSS('opacity', '1');

    const results = await new AxeBuilder({ page })
      .include('.tessera-modal-content')
      .analyze();

    expect(results.violations).toEqual([]);
  });
});
