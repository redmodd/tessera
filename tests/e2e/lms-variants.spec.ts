import { test, expect, type Page } from '@playwright/test';
import { type ChildProcess } from 'node:child_process';
import { installScorm12Mock, installScorm2004Mock } from './lms-mocks.js';
import {
  answerGradedQuiz,
  answerMatching,
  interactionWrites,
  reportedQuestionCount,
  startPreview,
  waitForServer,
  waitForTesseraContent,
} from './helpers.js';

/**
 * SCORM 1.2 roundtrips that `free` cannot host.
 *
 * The timing tests need graded review/never quizzes, and cmi.core.score.raw is
 * the *course* score — adding graded quizzes to `free` would move it for every
 * assertion in lms-roundtrip.spec.ts — so they run against the quiz-timing
 * fixture.
 */

async function openQuiz(page: Page, base: string, title: string) {
  await page.goto(base);
  await waitForTesseraContent(page);
  await page.locator('.tessera-nav-page', { hasText: title }).click();
  await page.waitForSelector('.tessera-quiz', { timeout: 10000 });
}

test.describe.serial('quiz reporting timing — review and never', () => {
  const PORT = 5310;
  const BASE = `http://localhost:${PORT}`;
  let preview: ChildProcess;

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(120_000);
    preview = startPreview('quiz-timing', 'scorm12', PORT);
    const page = await browser.newPage();
    try {
      await waitForServer(page, BASE);
    } finally {
      await page.close();
    }
  });

  test.afterAll(() => preview?.kill('SIGTERM'));
  test.beforeEach(async ({ page }) => installScorm12Mock(page));

  test('Review mode reports nothing until Submit, then every question at once', async ({
    page,
  }) => {
    await openQuiz(page, BASE, 'Review Timing Quiz');

    const primary = page.locator('.tessera-quiz-nav .tessera-btn-primary');

    // Q1 — MultipleChoice, "Mercury" is index 1.
    await page
      .locator('.tessera-quiz-question-wrapper.active .tessera-mc-option')
      .nth(1)
      .click();
    await expect(primary).toHaveText(/Next/);
    await page.waitForTimeout(300);
    expect(await interactionWrites(page)).toEqual([]);
    await primary.click();

    // Q2 — FillInTheBlank. Blurring the input commits nothing, so the log
    // must still be empty after it.
    const input = page.locator(
      '.tessera-quiz-question-wrapper.active input[type="text"]',
    );
    await input.fill('H2O');
    await input.blur();
    await page.waitForTimeout(300);
    expect(await interactionWrites(page)).toEqual([]);
    await primary.click();

    // Q3 — Matching. Completing the last answer must not flip the button into
    // a reveal, and must not report anything on its own.
    await answerMatching(page, { '1': 'One', '2': 'Two', '3': 'Three' });

    const submit = page.locator('.tessera-quiz-btn-submit');
    await submit.waitFor({ state: 'visible', timeout: 5000 });
    await page.waitForTimeout(300);
    expect(await interactionWrites(page)).toEqual([]);

    await submit.click();
    await page.waitForSelector('.tessera-quiz-results', { timeout: 5000 });

    // One index per question, all of them written by the single Submit.
    await expect
      .poll(() => reportedQuestionCount(page), { timeout: 5000 })
      .toBe(3);
  });

  test('Never mode has no reveal path and reports only on Submit', async ({
    page,
  }) => {
    await openQuiz(page, BASE, 'Never Timing Quiz');

    const primary = page.locator('.tessera-quiz-nav .tessera-btn-primary');

    // Q1 — "7 continents" is index 2. Never mode offers no reveal, so the
    // button stays Next rather than becoming a mid-quiz Submit.
    await page
      .locator('.tessera-quiz-question-wrapper.active .tessera-mc-option')
      .nth(2)
      .click();
    await expect(primary).toHaveText(/Next/);
    await primary.click();

    await page
      .locator('.tessera-quiz-question-wrapper.active input[type="text"]')
      .fill('Tokyo');

    const submit = page.locator('.tessera-quiz-btn-submit');
    await submit.waitFor({ state: 'visible', timeout: 5000 });
    await page.waitForTimeout(300);
    expect(await interactionWrites(page)).toEqual([]);

    await submit.click();
    await page.waitForSelector('.tessera-quiz-results', { timeout: 5000 });

    await expect
      .poll(() => reportedQuestionCount(page), { timeout: 5000 })
      .toBe(2);
  });
});

/**
 * `free` with completion.mode 'quiz'. SCORM 1.2 folds completion and success
 * into lesson_status, so 2004 is the standard that can show the quiz alone
 * completing the course.
 */
test.describe.serial('completion.mode quiz', () => {
  const PORT = 5311;
  const BASE = `http://localhost:${PORT}`;
  let preview: ChildProcess;

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(120_000);
    preview = startPreview('completion-quiz', 'scorm2004', PORT);
    const page = await browser.newPage();
    try {
      await waitForServer(page, BASE);
    } finally {
      await page.close();
    }
  });

  test.afterAll(() => preview?.kill('SIGTERM'));
  test.beforeEach(async ({ page }) => installScorm2004Mock(page));

  test('passing the graded quiz completes the course with pages left unvisited', async ({
    page,
  }) => {
    await page.goto(BASE);
    await waitForTesseraContent(page);

    const totalPages = await page.locator('.tessera-nav-page').count();

    await page
      .locator('.tessera-nav-page', { hasText: 'Graded Assessment' })
      .click();
    await page.waitForSelector('.tessera-quiz', { timeout: 10000 });

    await answerGradedQuiz(page);

    await expect
      .poll(
        () =>
          page.evaluate(
            () =>
              (window as any).__scormDataSnapshot()['cmi.completion_status'],
          ),
        { timeout: 5000 },
      )
      .toBe('completed');

    const data = await page.evaluate(() =>
      (window as any).__scormDataSnapshot(),
    );
    const visited = JSON.parse(data['cmi.suspend_data']).v as number[];
    expect(visited.length).toBeLessThan(totalPages);
  });
});
