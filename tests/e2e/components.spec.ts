import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { navigateToPage, waitForTesseraContent } from './helpers.js';

async function openCourse(page: Page) {
  await page.goto('/');
  await waitForTesseraContent(page);
}

async function openFresh(page: Page, title: string, ready: string) {
  await openCourse(page);
  await navigateToPage(page, title);
  await page.waitForSelector(ready);
}

test.describe('Component — Accordion', () => {
  test.beforeEach(({ page }) =>
    openFresh(page, 'Accordion & Carousel', '.tessera-accordion'),
  );

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
  test.beforeEach(({ page }) =>
    openFresh(page, 'Accordion & Carousel', '.tessera-carousel'),
  );

  test('carousel shows first slide and navigation dots', async ({ page }) => {
    const dots = page.locator('.tessera-carousel-dot');
    const dotCount = await dots.count();
    expect(dotCount).toBe(3);

    // First dot should be active
    await expect(dots.nth(0)).toHaveClass(/active/);
  });

  test('carousel prev/next buttons navigate slides and announce', async ({
    page,
  }) => {
    const dots = page.locator('.tessera-carousel-dot');
    await page.getByRole('button', { name: 'Next slide' }).click();
    await expect(dots.nth(1)).toHaveClass(/active/);
    await expect(
      page.locator('.tessera-carousel [aria-live="polite"]'),
    ).toHaveText('Slide 2 of 3');
  });

  test('carousel Tab stops: one dot, the arrows, and only the current slide', async ({
    page,
  }) => {
    async function carouselTabStops() {
      await page.locator('.tessera-accordion-trigger').last().focus();
      const stops: string[] = [];
      for (let i = 0; i < 10; i++) {
        await page.keyboard.press('Tab');
        const stop = await page.evaluate(() => {
          const el = document.activeElement as HTMLElement;
          if (!el.closest('.tessera-carousel')) return null;
          return el.getAttribute('aria-label') ?? el.textContent!.trim();
        });
        if (stop === null && stops.length) break;
        if (stop !== null) stops.push(stop);
      }
      return stops;
    }

    expect(await carouselTabStops()).toEqual(['Go to slide 1', 'Next slide']);

    await page.getByRole('button', { name: 'Next slide' }).click();
    expect(await carouselTabStops()).toEqual([
      'Slide 2 action',
      'Previous slide',
      'Go to slide 2',
      'Next slide',
    ]);
  });

  test('carousel dots follow the tabs pattern', async ({ page }) => {
    const dots = page.locator('.tessera-carousel-dot');
    const status = page.locator('.tessera-carousel [aria-live="polite"]');
    const slideFor = async (dot: number) =>
      page.locator(
        `[id="${await dots.nth(dot).getAttribute('aria-controls')}"]`,
      );

    for (let i = 0; i < 3; i++) {
      await expect(await slideFor(i)).toHaveAttribute('role', 'tabpanel');
    }
    await expect(await slideFor(0)).not.toHaveAttribute('inert');
    await expect(await slideFor(1)).toHaveAttribute('inert');
    await expect(status).toHaveText('');

    await dots.nth(0).focus();
    await page.keyboard.press('ArrowRight');
    await expect(dots.nth(1)).toBeFocused();
    await expect(dots.nth(1)).toHaveAttribute('aria-selected', 'true');
    await expect(await slideFor(1)).not.toHaveAttribute('inert');
    await expect(await slideFor(0)).toHaveAttribute('inert');
    await expect(status).toHaveText('Slide 2 of 3');

    await page.keyboard.press('End');
    await expect(dots.nth(2)).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(dots.nth(0)).toBeFocused();
    await page.keyboard.press('ArrowLeft');
    await expect(dots.nth(2)).toBeFocused();
    await page.keyboard.press('Home');
    await expect(dots.nth(0)).toBeFocused();
    await expect(status).toHaveText('Slide 1 of 3');
  });
});

test.describe('Component — RevealModal', () => {
  test.beforeEach(({ page }) =>
    openFresh(page, 'Modal, Video & Audio', '.tessera-reveal-trigger'),
  );

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

test.describe('Component — Sorting', () => {
  test.beforeEach(({ page }) =>
    openFresh(page, 'Modal, Video & Audio', '.tessera-sorting-card'),
  );

  test('a click anywhere on a target places the card, and placed cards return to the deck', async ({
    page,
  }) => {
    const sorting = page.locator('.tessera-sorting');
    const card = sorting.locator('.tessera-sorting-card');
    const counter = sorting.locator('.tessera-sorting-counter');
    const fruit = sorting.locator('.tessera-sorting-target').first();

    await card.click();
    await fruit.getByRole('button', { name: /^Fruit/ }).click();
    await expect(counter).toHaveText('2 of 3 to sort');

    // With no card selected, placed items sit above the target button.
    await fruit
      .locator('.tessera-sorting-item-text')
      .click({ trial: true, timeout: 2000 });

    // force skips Playwright's own hit check: the real pointer must land on
    // the target button stretched over the placed item.
    await card.click();
    await fruit.locator('.tessera-sorting-placed-item').click({ force: true });
    await expect(counter).toHaveText('1 of 3 to sort');
    await expect(fruit.locator('.tessera-sorting-placed-item')).toHaveCount(2);

    expect(
      (await new AxeBuilder({ page }).include('.tessera-sorting').analyze())
        .violations,
    ).toEqual([]);

    await fruit
      .getByRole('button', { name: /^Return/ })
      .first()
      .click();
    await expect(counter).toHaveText('2 of 3 to sort');
    await expect(fruit.locator('.tessera-sorting-placed-item')).toHaveCount(1);
  });

  test('checked results pass axe audit', async ({ page }) => {
    const sorting = page.locator('.tessera-sorting');
    const fruit = sorting.getByRole('button', { name: /^Fruit/ });

    for (let i = 0; i < 3; i++) {
      await sorting.locator('.tessera-sorting-card').click();
      await fruit.click();
    }
    await sorting.getByRole('button', { name: 'Submit' }).click();
    await expect(sorting.locator('.tessera-question-review')).toBeVisible();
    await expect(sorting.getByText('(incorrect)')).toHaveCount(1);

    expect(
      (await new AxeBuilder({ page }).include('.tessera-sorting').analyze())
        .violations,
    ).toEqual([]);
  });
});

test.describe('Component Accessibility', () => {
  test.beforeEach(({ page }) => openCourse(page));

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
