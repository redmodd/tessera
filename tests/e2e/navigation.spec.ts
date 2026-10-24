import { test, expect, type Locator } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {
  answerGradedQuiz,
  navigateToPage,
  waitForTesseraContent,
} from './helpers.js';

/** Dispatches ArrowRight on the element and reports whether the layout cancelled it. */
function arrowCancelled(target: Locator, init: KeyboardEventInit = {}) {
  return target.evaluate((el, init) => {
    const e = new KeyboardEvent('keydown', {
      key: 'ArrowRight',
      bubbles: true,
      cancelable: true,
      ...init,
    });
    el.dispatchEvent(e);
    return e.defaultPrevented;
  }, init);
}

test.describe('Navigation — Free Mode', () => {
  test.beforeEach(async ({ page }) => {
    // Clear localStorage to start fresh
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.goto('/');
    await waitForTesseraContent(page);
  });

  test('loads first page on initial visit', async ({ page }) => {
    await expect(page.locator('.tessera-content h1')).toContainText('Welcome');
    await expect(page).toHaveTitle('Welcome – E2E Test Course');
    await expect(page.locator('body')).toBeFocused();
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
    await navigateToPage(page, 'Objectives');
    await expect(page.locator('.tessera-content h1')).toContainText(
      'Course Objectives',
    );
    await expect(page.locator('.tessera-content h1')).toBeFocused();
  });

  test('focus moved while a page loads stays where the learner put it', async ({
    page,
  }) => {
    let release = () => {};
    const held = new Promise<void>((r) => (release = r));
    await page.route(/objectives\.svelte/, async (route) => {
      await held;
      await route.continue();
    });
    await page.goto('/');
    await waitForTesseraContent(page);

    await page.locator('.tessera-nav-page', { hasText: 'Objectives' }).click();
    const other = page.locator('.tessera-nav-page', { hasText: 'Welcome' });
    await other.focus();
    release();
    await expect(page.locator('.tessera-content h1')).toContainText(
      'Course Objectives',
    );
    await expect(other).toBeFocused();
  });

  test('a page chosen while the first page loads gets focus', async ({
    page,
  }) => {
    let release = () => {};
    const held = new Promise<void>((r) => (release = r));
    await page.route(/welcome\.svelte/, async (route) => {
      await held;
      await route.continue();
    });
    await page.goto('/');

    await page.locator('.tessera-nav-page', { hasText: 'Objectives' }).click();
    release();
    await expect(page.locator('.tessera-content h1')).toContainText(
      'Course Objectives',
    );
    await expect(page.locator('.tessera-content h1')).toBeFocused();
  });

  test('can click any page in free mode — no locking', async ({ page }) => {
    // Should be able to jump directly to a later page
    await navigateToPage(page, 'Accordion & Carousel');

    // Jump back to an earlier page
    await navigateToPage(page, 'Welcome');
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
    await expect(page.locator('.tessera-content h1')).toContainText(
      'Course Objectives',
    );
    await expect(page.locator('.tessera-content h1')).toBeFocused();
    await expect(page).toHaveTitle('Objectives – E2E Test Course');
  });

  test('prev/next navigate through all pages end-to-end', async ({ page }) => {
    const nextBtn = page.locator('.tessera-page-nav-btn', { hasText: 'Next' });
    const prevBtn = page.locator('.tessera-page-nav-btn', {
      hasText: 'Previous',
    });

    // Navigate forward a few pages
    await nextBtn.click(); // Page 2
    await expect(page.locator('.tessera-content h1')).toContainText(
      'Course Objectives',
    );
    await nextBtn.click(); // Page 3
    await expect(page.locator('.tessera-content h1')).toContainText(
      'Callouts & Images',
    );

    // Navigate back
    await prevBtn.click(); // Page 2
    await expect(page.locator('.tessera-content h1')).toContainText(
      'Course Objectives',
    );
  });

  test('next button is disabled when further progress is gated', async ({
    page,
  }) => {
    // Navigate to the graded quiz page (has gatesProgress: true)
    // The page after it is locked until the quiz is passed
    await navigateToPage(page, 'Graded Assessment');
    const nextBtn = page.locator('.tessera-page-nav-btn', { hasText: 'Next' });
    // Next should be disabled — the quiz gates progress and hasn't been passed
    await expect(nextBtn).toBeDisabled();
  });

  test('current page is highlighted in sidebar', async ({ page }) => {
    // The first page should have aria-current
    const activePage = page.locator('.tessera-nav-page[aria-current="page"]');
    await expect(activePage).toContainText('Welcome');

    // Navigate and check highlight moves
    await navigateToPage(page, 'Objectives');
    const newActive = page.locator('.tessera-nav-page[aria-current="page"]');
    await expect(newActive).toContainText('Objectives');
  });

  test('progress bar updates as pages are visited', async ({ page }) => {
    const progressLabel = page.locator('.tessera-progress-label');
    await expect(progressLabel).toContainText(/\d+ of \d+ pages/);

    await navigateToPage(page, 'Objectives');

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
    await waitForTesseraContent(page);
  });

  test('ArrowRight navigates to next page', async ({ page }) => {
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('.tessera-content h1')).toContainText(
      'Course Objectives',
    );
  });

  test('ArrowLeft navigates to previous page', async ({ page }) => {
    // Go to page 2 first
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('.tessera-content h1')).toContainText(
      'Course Objectives',
    );
    await expect(page.locator('.tessera-content h1')).toBeFocused();

    // Go back, from the focused heading
    await page.keyboard.press('ArrowLeft');
    await expect(page.locator('.tessera-content h1')).toContainText('Welcome');
    await expect(page.locator('.tessera-content h1')).toBeFocused();
  });

  test('arrow keys with a modifier are left to the browser', async ({
    page,
  }) => {
    // The layout cancels a key it navigates on; the last press has no modifier.
    const body = page.locator('body');
    for (const mod of ['altKey', 'ctrlKey', 'metaKey', 'shiftKey']) {
      expect(await arrowCancelled(body, { [mod]: true })).toBe(false);
    }
    expect(await arrowCancelled(body)).toBe(true);
  });

  test('arrow keys on a native media player are left to it', async ({
    page,
  }) => {
    await navigateToPage(page, 'Modal, Video & Audio');
    expect(await arrowCancelled(page.locator('.tessera-audio-player'))).toBe(
      false,
    );
  });

  test('arrow keys on a focused link or button are left alone', async ({
    page,
  }) => {
    for (const selector of [
      '.tessera-nav-page',
      '.tessera-page-nav-btn:not([disabled])',
    ]) {
      const control = page.locator(selector).first();
      await control.focus();
      expect(await arrowCancelled(control)).toBe(false);
    }
  });

  test('arrow keys work from the focused heading of a quiz page', async ({
    page,
  }) => {
    await navigateToPage(page, 'Graded Assessment');
    await expect(page.locator('.tessera-content h1')).toBeFocused();
    await page.keyboard.press('ArrowLeft');
    await expect(page.locator('.tessera-content h1')).toContainText('Practice');
  });

  test('arrow keys stay in the quiz once its own heading has focus', async ({
    page,
  }) => {
    await navigateToPage(page, 'Graded Assessment');
    const primary = page.locator('.tessera-quiz-nav .tessera-btn-primary');
    await page
      .locator('.tessera-quiz-question-wrapper.active .tessera-mc-option')
      .nth(1)
      .click();
    await primary.click();
    await expect(primary).toHaveText('Next Question');
    await primary.click();
    const progress = page.getByRole('heading', { name: 'Question 2 of 3' });
    await expect(progress).toBeFocused();
    expect(await arrowCancelled(progress)).toBe(false);
  });

  // dispatchEvent clicks without moving focus, as Safari does.
  test('arrow keys stay in the quiz once it refocuses the heading a page change focused', async ({
    page,
  }) => {
    await page.addStyleTag({ content: '.tessera-page h1 { display: none }' });
    await navigateToPage(page, 'Practice Quiz');
    const progress = page.locator('.tessera-quiz-progress-text');
    await expect(progress).toHaveAccessibleName('Question 1 of 2');
    await expect(progress).toBeFocused();

    await page
      .locator('.tessera-quiz-question-wrapper.active .tessera-mc-option input')
      .nth(1)
      .dispatchEvent('click');
    await page
      .locator('.tessera-quiz-nav .tessera-btn-primary')
      .dispatchEvent('click');
    await expect(progress).toHaveAccessibleName('Question 2 of 2');
    await expect(progress).toBeFocused();
    expect(await arrowCancelled(progress)).toBe(false);
  });

  test('a finished quiz page focuses its results, and arrow keys still work', async ({
    page,
  }) => {
    await navigateToPage(page, 'Graded Assessment');
    await answerGradedQuiz(page);
    await navigateToPage(page, 'Objectives');
    await navigateToPage(page, 'Graded Assessment');
    await expect(
      page.getByRole('group', { name: /^Quiz Results\s*[\d.]+%/ }),
    ).toBeFocused();
    await page.keyboard.press('ArrowLeft');
    await expect(page.locator('.tessera-content h1')).toContainText('Practice');
  });

  test('ArrowLeft does nothing on first page', async ({ page }) => {
    await page.keyboard.press('ArrowLeft');
    // Should still be on page 1
    await expect(page.locator('.tessera-content h1')).toContainText('Welcome');
  });

  test('arrow keys in a form field are left to it, even with tabindex -1', async ({
    page,
  }) => {
    const tags = ['input', 'textarea', 'select'];
    await page.locator('.tessera-content').evaluate((el, tags) => {
      for (const tag of tags) {
        el.appendChild(document.createElement(tag)).tabIndex = -1;
      }
    }, tags);
    for (const tag of tags) {
      const field = page.locator(`.tessera-content > ${tag}`);
      await field.focus();
      expect(await arrowCancelled(field)).toBe(false);
    }
  });
});

test.describe('Navigation — Accessibility', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.goto('/');
    await waitForTesseraContent(page);
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
