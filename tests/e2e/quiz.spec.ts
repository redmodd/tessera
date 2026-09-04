import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

async function waitForContent(page: Page) {
  await page.waitForSelector('.tessera-content');
  await page
    .waitForFunction(
      () => !document.querySelector('.tessera-loading-skeleton'),
      {
        timeout: 5000,
      },
    )
    .catch(() => {});
}

async function navigateToPage(page: Page, pageTitle: string) {
  await page.locator('.tessera-nav-page', { hasText: pageTitle }).click();
  await waitForContent(page);
}

const primaryBtn = (page: Page) =>
  page.locator('.tessera-quiz-nav .tessera-btn-primary');

async function answerMultipleChoice(page: Page, optionIndex: number) {
  const radios = page.locator(
    '.tessera-quiz-question-wrapper.active .tessera-mc-option',
  );
  await radios.nth(optionIndex).click();
}

async function answerFillInTheBlank(page: Page, text: string) {
  const input = page.locator(
    '.tessera-quiz-question-wrapper.active input[type="text"]',
  );
  await input.fill(text);
}

/**
 * Click each left item and select its mapped right item by visible text.
 * Waits for the matched count to advance after each pair so we don't race the
 * Svelte effect that records the pairing.
 */
async function answerMatching(page: Page, matchMap: Record<string, string>) {
  const activeQ = page.locator('.tessera-quiz-question-wrapper.active');
  const leftItems = activeQ.locator('.tessera-matching-item.left');
  const matched = activeQ.locator('.tessera-matching-item.left.matched');

  const leftCount = await leftItems.count();
  let expected = 0;
  for (let i = 0; i < leftCount; i++) {
    const leftText = (await leftItems.nth(i).textContent())?.trim();
    const targetRight = matchMap[leftText || ''];
    if (!targetRight) continue;
    await leftItems.nth(i).click();
    await activeQ
      .locator('.tessera-matching-item.right', { hasText: targetRight })
      .first()
      .click();
    expected++;
    await expect(matched).toHaveCount(expected);
  }
}

/**
 * Advance past one immediate-feedback question. The primary button cycles:
 *   - mid-quiz: "Submit Answer" (with answer) → first click reveals feedback and
 *     relabels to "Next Question" → second click advances.
 *   - last question: "Submit Answer" → click reveals feedback → primary button
 *     becomes the "See Results" button.
 * We wait on the label text to change instead of sleeping.
 */
async function checkThenContinue(page: Page, isLast: boolean) {
  const btn = primaryBtn(page);
  if (isLast) {
    await expect(btn).toHaveText('Submit Answer');
    await btn.click();
    await expect(page.locator('.tessera-quiz-btn-submit')).toBeVisible();
  } else {
    await expect(btn).toHaveText('Submit Answer');
    await btn.click();
    await expect(btn).toHaveText('Next Question');
    await btn.click();
  }
}

async function completeGradedQuiz(
  page: Page,
  {
    mc = 1,
    fill = 'blue',
    matchMap = { '1': 'One', '2': 'Two', '3': 'Three' },
  }: {
    mc?: number;
    fill?: string;
    matchMap?: Record<string, string>;
  } = {},
) {
  const progress = page.locator('.tessera-quiz-progress-desktop').first();

  // Q1: MultipleChoice
  await expect(progress).toContainText('Question 1 of 3');
  await answerMultipleChoice(page, mc);
  await checkThenContinue(page, false);

  // Q2: FillInTheBlank
  await expect(progress).toContainText('Question 2 of 3');
  await answerFillInTheBlank(page, fill);
  await checkThenContinue(page, false);

  // Q3: Matching
  await expect(progress).toContainText('Question 3 of 3');
  await answerMatching(page, matchMap);
  await checkThenContinue(page, true);

  // Submit and wait for the results panel.
  await page.locator('.tessera-quiz-btn-submit').click();
  await expect(page.locator('.tessera-quiz-results')).toBeVisible();
}

test.describe('Quiz — Graded Assessment', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.goto('/');
    await waitForContent(page);
    await navigateToPage(page, 'Graded Assessment');
    await page.waitForSelector('.tessera-quiz', { timeout: 10000 });
  });

  test('quiz shows first question with progress indicator', async ({
    page,
  }) => {
    const progress = page.locator('.tessera-quiz-progress');
    await expect(progress).toContainText(/1.*3/);

    const activeQuestion = page.locator(
      '.tessera-quiz-question-wrapper.active',
    );
    await expect(activeQuestion).toBeVisible();
  });

  test('complete quiz with all correct answers — score 100%', async ({
    page,
  }) => {
    await completeGradedQuiz(page);

    await expect(page.locator('.tessera-quiz-score-value')).toContainText(
      '100%',
    );
    await expect(page.locator('.tessera-quiz-score-label')).toContainText(
      'Passed',
    );
  });

  test('complete quiz with wrong answers — shows correct score', async ({
    page,
  }) => {
    await completeGradedQuiz(page, {
      mc: 0,
      fill: 'green',
      matchMap: { '1': 'Three', '2': 'One', '3': 'Two' },
    });

    const scoreText = await page
      .locator('.tessera-quiz-score-value')
      .textContent();
    const scoreNum = parseInt(scoreText || '0', 10);
    expect(scoreNum).toBeLessThan(100);
  });

  test('review mode shows feedback after submission', async ({ page }) => {
    await completeGradedQuiz(page);

    const reviewBtn = page.locator('.tessera-quiz-btn', { hasText: 'Review' });
    await expect(reviewBtn).toBeVisible();
    await reviewBtn.click();

    const progress = page.locator('.tessera-quiz-progress');
    await expect(progress).toContainText(/Review/);
  });

  test('retry flow — retry button appears after failure', async ({ page }) => {
    await completeGradedQuiz(page, {
      mc: 0,
      fill: 'wrong',
      matchMap: { '1': 'Three', '2': 'One', '3': 'Two' },
    });

    const retryBtn = page.locator('.tessera-quiz-btn', { hasText: 'Retry' });
    await expect(retryBtn).toBeVisible();
    await retryBtn.click();

    // Back to question 1 — wait for the progress text to reflect it.
    await expect(
      page.locator('.tessera-quiz-progress-desktop').first(),
    ).toContainText('Question 1 of 3');
  });

  test('maxAttempts exhausted — retry button disappears', async ({ page }) => {
    const wrongOpts = {
      mc: 0,
      fill: 'wrong',
      matchMap: { '1': 'Three', '2': 'One', '3': 'Two' },
    };

    for (let attempt = 0; attempt < 3; attempt++) {
      await completeGradedQuiz(page, wrongOpts);

      if (attempt < 2) {
        const retryBtn = page.locator('.tessera-quiz-btn', {
          hasText: 'Retry',
        });
        await expect(retryBtn).toBeVisible();
        await retryBtn.click();
        // Wait for the quiz to be back at question 1 before the next attempt.
        await expect(
          page.locator('.tessera-quiz-progress-desktop').first(),
        ).toContainText('Question 1 of 3');
      }
    }

    const retryBtn = page.locator('.tessera-quiz-btn', { hasText: 'Retry' });
    await expect(retryBtn).not.toBeVisible();

    const exhaustedMsg = page.locator('.tessera-quiz-attempts-exhausted');
    await expect(exhaustedMsg).toBeVisible();
  });
});

test.describe('Quiz — Gating', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.goto('/');
    await waitForContent(page);
  });

  test('failing gated quiz locks the page after it', async ({ page }) => {
    await navigateToPage(page, 'Graded Assessment');
    await page.waitForSelector('.tessera-quiz', { timeout: 10000 });

    const conclusionPage = page.locator('.tessera-nav-page', {
      hasText: 'Conclusion',
    });
    await expect(conclusionPage).toHaveAttribute('aria-disabled', 'true');

    const nextBtn = page.locator('.tessera-page-nav-btn', { hasText: 'Next' });
    await expect(nextBtn).toBeDisabled();

    await completeGradedQuiz(page, {
      mc: 0,
      fill: 'wrong',
      matchMap: { '1': 'Three', '2': 'One', '3': 'Two' },
    });
    await expect(page.locator('.tessera-quiz-score-label')).toContainText(
      'Not Passed',
    );

    await expect(conclusionPage).toHaveAttribute('aria-disabled', 'true');
    await expect(nextBtn).toBeDisabled();
  });

  test('passing gated quiz unlocks the page after it', async ({ page }) => {
    await navigateToPage(page, 'Graded Assessment');
    await page.waitForSelector('.tessera-quiz', { timeout: 10000 });

    const conclusionPage = page.locator('.tessera-nav-page', {
      hasText: 'Conclusion',
    });
    await expect(conclusionPage).toHaveAttribute('aria-disabled', 'true');

    await completeGradedQuiz(page);
    await expect(page.locator('.tessera-quiz-score-label')).toContainText(
      'Passed',
    );

    await expect(conclusionPage).not.toHaveAttribute('aria-disabled', 'true');

    const nextBtn = page.locator('.tessera-page-nav-btn', { hasText: 'Next' });
    await expect(nextBtn).toBeEnabled();

    await nextBtn.click();
    await waitForContent(page);
    await expect(page.locator('.tessera-content h1')).toContainText(
      'Congratulations',
    );
  });
});

test.describe('Quiz — Accessibility', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.goto('/');
    await waitForContent(page);
  });

  test('graded quiz initial render passes axe audit', async ({ page }) => {
    await navigateToPage(page, 'Graded Assessment');
    await page.waitForSelector('.tessera-quiz', { timeout: 10000 });

    const results = await new AxeBuilder({ page })
      .include('.tessera-quiz')
      .analyze();
    expect(results.violations).toEqual([]);
  });

  test('quiz results panel passes axe audit', async ({ page }) => {
    await navigateToPage(page, 'Graded Assessment');
    await page.waitForSelector('.tessera-quiz', { timeout: 10000 });
    await completeGradedQuiz(page);

    const results = await new AxeBuilder({ page })
      .include('.tessera-quiz-results')
      .analyze();
    expect(results.violations).toEqual([]);
  });
});

test.describe('Quiz — Practice', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.goto('/');
    await waitForContent(page);
    await navigateToPage(page, 'Practice Quiz');
    await page.waitForSelector('.tessera-quiz', { timeout: 10000 });
  });

  test('practice quiz renders questions', async ({ page }) => {
    const progress = page.locator('.tessera-quiz-progress');
    await expect(progress).toContainText(/1/);
  });

  test('practice quiz allows unlimited retries', async ({ page }) => {
    const progress = page.locator('.tessera-quiz-progress-desktop').first();

    // Practice quiz is in review feedback mode — primary button is "Next"
    // until the last question, when it switches to "Submit".
    await expect(progress).toContainText('Question 1 of 2');
    await answerMultipleChoice(page, 0);
    await primaryBtn(page).click();

    await expect(progress).toContainText('Question 2 of 2');
    await answerFillInTheBlank(page, 'wrong');

    const submitBtn = page.locator('.tessera-quiz-btn-submit');
    await expect(submitBtn).toBeVisible();
    await submitBtn.click();

    await expect(page.locator('.tessera-quiz-results')).toBeVisible();

    const retryBtn = page.locator('.tessera-quiz-btn', { hasText: 'Retry' });
    await expect(retryBtn).toBeVisible();
  });
});
