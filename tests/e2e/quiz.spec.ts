import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {
  answerFillInTheBlank,
  answerMatching,
  answerMultipleChoice,
  completePracticeQuiz,
  expectAAText,
  navigateToPage,
  primaryBtn,
  readSavedState,
  waitForTesseraContent,
} from './helpers.js';

/**
 * Advance past one immediate-feedback question. "Submit" reveals the feedback,
 * which takes focus, and the button becomes "Next Question" (or "See Results"
 * on the last question). "Next Question" focuses the next question's heading.
 * We wait on the label text to change instead of sleeping.
 */
async function checkThenContinue(page: Page, isLast: boolean) {
  const btn = primaryBtn(page);
  const feedback = page
    .locator('.tessera-quiz-question-wrapper.active')
    .getByRole('group');
  if (isLast) {
    await expect(btn).toHaveText('Submit');
    await btn.click();
    await expect(page.locator('.tessera-quiz-btn-submit')).toBeVisible();
    await expect(feedback).toBeFocused();
  } else {
    await expect(btn).toHaveText('Submit');
    await btn.click();
    await expect(btn).toHaveText('Next Question');
    await expect(feedback).toBeFocused();
    await btn.click();
    await expect(
      page.getByRole('heading', { name: /^Question \d+ of \d+$/ }),
    ).toBeFocused();
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
  await expect(
    page.getByRole('group', { name: /^Quiz Results\s*[\d.]+%/ }),
  ).toBeFocused();
}

test.describe('Quiz — Graded Assessment', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.goto('/');
    await waitForTesseraContent(page);
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

  test('page content renders above the questions and hides on results', async ({
    page,
  }) => {
    const intro = page.locator('.tessera-quiz-intro');
    await expect(intro).toBeVisible();
    await expect(intro.locator('h1')).toHaveText('Graded Assessment');
    await expect(
      intro.getByText('This quiz is graded and gates progress.'),
    ).toBeVisible();

    await completeGradedQuiz(page);

    await expect(intro).toBeHidden();
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

    // Attempts are persisted, so reopening the course doesn't hand back a
    // fresh allowance.
    await page.reload();
    await waitForTesseraContent(page);
    await expect(page.locator('.tessera-quiz-results')).toBeVisible();
    await expect(
      page.locator('.tessera-quiz-btn', { hasText: 'Retry' }),
    ).not.toBeVisible();
    await expect(
      page.locator('.tessera-quiz-attempts-exhausted'),
    ).toBeVisible();
  });

  test('a submitted quiz comes back as results with its answers to review', async ({
    page,
  }) => {
    await completeGradedQuiz(page);
    const score = await page.locator('.tessera-quiz-score-value').textContent();
    expect(score).toBe('100%');

    await page.reload();
    await waitForTesseraContent(page);

    await expect(page.locator('.tessera-quiz-results')).toBeVisible();
    await expect(page.locator('.tessera-quiz-score-value')).toHaveText('100%');
    await expect(page.locator('.tessera-quiz-results-detail')).toHaveText(
      'You answered 3 of 3 questions correctly.',
    );

    const active = page.locator('.tessera-quiz-question-wrapper.active');
    await page.getByRole('button', { name: 'Review Answers' }).click();
    await expect(active.getByRole('radio', { name: '4' })).toBeChecked();
    await primaryBtn(page).click();
    await expect(active.locator('input[type="text"]')).toHaveValue('blue');
    await primaryBtn(page).click();
    await expect(
      active.locator('.tessera-matching-item.left.correct'),
    ).toHaveCount(3);
  });

  test('an incorrect-only retry after a reload keeps the correct answers locked', async ({
    page,
  }) => {
    await completeGradedQuiz(page, { mc: 0 });
    await expect(page.locator('.tessera-quiz-score-value')).toHaveText(
      '66.67%',
    );

    await page.reload();
    await waitForTesseraContent(page);
    await page.locator('.tessera-quiz-btn', { hasText: 'Retry' }).click();

    const progress = page.locator('.tessera-quiz-progress-desktop').first();
    const active = page.locator('.tessera-quiz-question-wrapper.active');
    await expect(progress).toContainText('Question 1 of 3');
    await answerMultipleChoice(page, 1);
    await checkThenContinue(page, false);

    await expect(progress).toContainText('Question 2 of 3');
    await expect(active.locator('.tessera-quiz-locked-banner')).toBeVisible();
    await expect(active.locator('input[type="text"]')).toHaveValue('blue');
    await primaryBtn(page).click();

    await expect(progress).toContainText('Question 3 of 3');
    await expect(active.locator('.tessera-quiz-locked-banner')).toBeVisible();
    await page.locator('.tessera-quiz-btn-submit').click();
    await expect(page.locator('.tessera-quiz-score-value')).toHaveText('100%');
  });
});

test.describe('Quiz — Gating', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.goto('/');
    await waitForTesseraContent(page);
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
    await waitForTesseraContent(page);
  });

  test('graded quiz initial render passes axe audit', async ({ page }) => {
    await navigateToPage(page, 'Graded Assessment');
    await page.waitForSelector('.tessera-quiz', { timeout: 10000 });

    const results = await new AxeBuilder({ page })
      .include('.tessera-quiz')
      .analyze();
    expect(results.violations).toEqual([]);
  });

  test('matched pair buttons pass axe audit before and after submit', async ({
    page,
  }) => {
    await navigateToPage(page, 'Graded Assessment');
    await page.waitForSelector('.tessera-quiz', { timeout: 10000 });
    await answerMultipleChoice(page, 1);
    await checkThenContinue(page, false);
    await answerFillInTheBlank(page, 'blue');
    await checkThenContinue(page, false);
    await answerMatching(page, { '1': 'One', '2': 'Two', '3': 'Three' });

    const matching = page.locator(
      '.tessera-quiz-question-wrapper.active .tessera-matching',
    );
    const audit = () =>
      new AxeBuilder({ page })
        .include('.tessera-quiz-question-wrapper.active .tessera-matching-grid')
        .analyze();

    await expect(
      matching.getByRole('button', {
        name: '1 1 (matched, activate to unmatch)',
      }),
    ).toBeVisible();
    await expect(
      matching.getByRole('button', { name: '1 One (matched)', exact: true }),
    ).toBeVisible();
    expect((await audit()).violations).toEqual([]);

    await primaryBtn(page).click();
    await expect(
      matching.getByRole('button', {
        name: '1 1 (matched, correct)',
        exact: true,
      }),
    ).toBeDisabled();
    await expect(
      matching.getByRole('button', {
        name: '1 One (matched, correct)',
        exact: true,
      }),
    ).toBeDisabled();
    expect((await audit()).violations).toEqual([]);
  });

  test('success and error feedback meets AA contrast', async ({ page }) => {
    await navigateToPage(page, 'Graded Assessment');
    await page.waitForSelector('.tessera-quiz', { timeout: 10000 });
    const audit = async (scope = '') =>
      (
        await new AxeBuilder({ page })
          .include(`.tessera-quiz-question-wrapper.active ${scope}`)
          .analyze()
      ).violations;
    const btn = primaryBtn(page);
    const activeQ = page.locator('.tessera-quiz-question-wrapper.active');

    // A wrong answer shows its error feedback and reveals the correct option's.
    await answerMultipleChoice(page, 0);
    await btn.click();
    await expect(btn).toHaveText('Next Question');
    await expectAAText(activeQ.locator('.tessera-mc-feedback'));
    await btn.click();

    await answerFillInTheBlank(page, 'red');
    await btn.click();
    await expect(btn).toHaveText('Next Question');
    await expect(
      activeQ.locator('.tessera-question-feedback.incorrect'),
    ).toBeVisible();
    expect(await audit()).toEqual([]);
    await btn.click();

    await answerMatching(page, { '1': 'One', '2': 'Two', '3': 'Three' });
    await btn.click();
    await expect(page.locator('.tessera-matching-review')).toBeVisible();
    expect(await audit('.tessera-matching-review')).toEqual([]);
    await expectAAText(activeQ.locator('.tessera-matching-badge'));
  });

  test('Tab reaches Submit, then the feedback leads to Next Question', async ({
    page,
  }) => {
    await navigateToPage(page, 'Graded Assessment');
    await page.waitForSelector('.tessera-quiz', { timeout: 10000 });
    const btn = primaryBtn(page);
    const active = page.locator('.tessera-quiz-question-wrapper.active');

    await answerMultipleChoice(page, 0);
    await btn.click();
    await expect(
      active.getByRole('group', { name: /Incorrect\s*3 is too low\./ }),
    ).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(btn).toHaveText('Next Question');
    await expect(btn).toBeFocused();

    await page.keyboard.press('Enter');
    await page.keyboard.press('Tab');
    await expect(active.locator('input')).toBeFocused();
    await page.keyboard.type('blue');
    await page.keyboard.press('Tab');
    await expect(btn).toHaveText('Submit');
    await expect(btn).toBeFocused();
  });

  test('review moves focus to each question, then back to the results', async ({
    page,
  }) => {
    await navigateToPage(page, 'Graded Assessment');
    await page.waitForSelector('.tessera-quiz', { timeout: 10000 });
    await completeGradedQuiz(page);
    const heading = (name: string) => page.getByRole('heading', { name });

    await page.getByRole('button', { name: 'Review Answers' }).click();
    await expect(heading('Review: Question 1 of 3')).toBeFocused();
    await primaryBtn(page).click();
    await expect(heading('Review: Question 2 of 3')).toBeFocused();
    await page.getByRole('button', { name: 'Back' }).click();
    await expect(heading('Review: Question 1 of 3')).toBeFocused();
    await primaryBtn(page).click();
    await primaryBtn(page).click();
    await page.getByRole('button', { name: 'Done' }).click();
    await expect(
      page.getByRole('group', { name: /^Quiz Results\s*[\d.]+%/ }),
    ).toBeFocused();
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

test.describe('Quiz — adjacent quiz pages', () => {
  test('a second quiz page starts fresh instead of inheriting the first', async ({
    page,
  }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.goto('/');
    await waitForTesseraContent(page);

    await navigateToPage(page, 'Practice Quiz');
    await page.waitForSelector('.tessera-quiz', { timeout: 10000 });
    const progress = page.locator('.tessera-quiz-progress-desktop').first();
    await expect(progress).toContainText('Question 1 of 2');
    await answerMultipleChoice(page, 1);
    await primaryBtn(page).click();
    await expect(progress).toContainText('Question 2 of 2');
    await answerFillInTheBlank(page, 'H2O');
    await page.locator('.tessera-quiz-btn-submit').click();
    await expect(page.locator('.tessera-quiz-results')).toBeVisible();

    await navigateToPage(page, 'Graded Assessment');
    await page.waitForSelector('.tessera-quiz', { timeout: 10000 });

    await expect(page.locator('.tessera-quiz-results')).toHaveCount(0);
    await expect(progress).toContainText('Question 1 of 3');
  });
});

test.describe('Quiz — Practice', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.goto('/');
    await waitForTesseraContent(page);
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

    await page.reload();
    await waitForTesseraContent(page);
    await expect(page.locator('.tessera-quiz-results')).toBeVisible();
    await expect(
      page.locator('.tessera-quiz-btn', { hasText: 'Retry' }),
    ).toBeVisible();
  });

  test('a weaker retry shows its own score alongside the best attempt', async ({
    page,
  }) => {
    await completePracticeQuiz(page, { mc: 1, fill: 'H2O' });
    await expect(page.locator('.tessera-quiz-score-value')).toHaveText('100%');
    await expect(page.getByTestId('quiz-best-score')).toHaveCount(0);

    await page.locator('.tessera-quiz-btn', { hasText: 'Retry' }).click();
    await completePracticeQuiz(page, { mc: 0, fill: 'wrong' });

    // The attempt and the record are labelled separately, so a failing retry
    // cannot label a quiz the LMS has recorded as passed "Not Passed".
    const attempt = page.getByTestId('quiz-attempt-score');
    const record = page.getByTestId('quiz-best-score');
    await expect(attempt).toContainText('0%');
    await expect(attempt).toContainText('Not Passed');
    await expect(record).toContainText('100%');
    await expect(record).toContainText('Passed');
    await expect(record).not.toContainText('Not Passed');

    // Only the best attempt is persisted, so that is what comes back.
    await page.reload();
    await waitForTesseraContent(page);
    await expect(page.locator('.tessera-quiz-score-value')).toHaveText('100%');
    await expect(page.getByTestId('quiz-best-score')).toHaveCount(0);

    // A weaker retry of the restored result must not lower the record either.
    await page.locator('.tessera-quiz-btn', { hasText: 'Retry' }).click();
    await completePracticeQuiz(page, { mc: 0, fill: 'wrong' });
    await expect(page.getByTestId('quiz-best-score')).toContainText('100%');
    const units = Object.values<{ s: number; a?: number }>(
      (await readSavedState(page)).g,
    );
    expect(Math.max(...units.map((u) => u.s))).toBe(100);
    expect(Math.max(...units.map((u) => u.a ?? 1))).toBe(3);
  });
});
