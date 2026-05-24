import { test, expect, type Page } from '@playwright/test';

/**
 * End-to-end fixture for Phase 5 Task 2 — proves a project-supplied
 * `quiz.svelte` (using only the public `useQuiz()` + `useQuestion()` API)
 * registers questions, dispatches `tessera-quiz-complete`, and reaches the
 * persistence adapter the same way the built-in `<Quiz>` does.
 *
 * The fixture's quiz shell is deliberately weird (one-page-all-questions,
 * no built-in `.tessera-quiz-*` markup) — if the data contract holds for
 * something this different, it holds for any custom shell.
 */

async function waitForContent(page: Page) {
  await page.waitForSelector('.tessera-content', { timeout: 15000 });
  await page
    .waitForFunction(
      () => !document.querySelector('.tessera-loading-skeleton'),
      {
        timeout: 5000,
      },
    )
    .catch(() => {});
}

async function navigateToExam(page: Page) {
  await page.locator('.tessera-nav-page', { hasText: 'Exam' }).click();
  await page.waitForSelector('[data-testid="custom-quiz"]', { timeout: 10000 });
}

test.describe('Custom quiz.svelte — public useQuiz() data contract', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.goto('/');
    await waitForContent(page);
  });

  test('virtual:tessera-quiz resolves to the project-supplied shell, not the built-in', async ({
    page,
  }) => {
    await navigateToExam(page);
    // Custom shell renders its testid; built-in renders `.tessera-quiz-progress`.
    await expect(page.locator('[data-testid="custom-quiz"]')).toBeVisible();
    await expect(page.locator('.tessera-quiz-progress')).toHaveCount(0);
  });

  test('useQuiz().registerQuestion picks up every question widget on the page', async ({
    page,
  }) => {
    await navigateToExam(page);
    // The custom shell stacks every registered question — count the rendered
    // list items to prove both built-in widgets registered.
    await expect(
      page.locator('[data-testid="custom-quiz"] .custom-quiz-item'),
    ).toHaveCount(2);
  });

  test('Submit is gated until every question has an answer', async ({
    page,
  }) => {
    await navigateToExam(page);
    const submit = page.locator('[data-testid="custom-quiz-submit"]');
    await expect(submit).toBeDisabled();

    // Answer Q1 (multiple choice — Mercury is index 1)
    await page
      .locator('[data-question-id="q-planet"] .tessera-mc-option')
      .nth(1)
      .click();
    await expect(submit).toBeDisabled();

    // Answer Q2 (fill-in)
    await page
      .locator('[data-question-id="q-water"] input[type="text"]')
      .fill('H2O');
    await expect(submit).toBeEnabled();
  });

  test('submit() dispatches tessera-quiz-complete with the rolled-up score', async ({
    page,
  }) => {
    await navigateToExam(page);

    await page.evaluate(() => {
      (window as any).__tesseraQuizEvents = [];
      document.addEventListener('tessera-quiz-complete', (e: Event) => {
        (window as any).__tesseraQuizEvents.push(
          JSON.parse(JSON.stringify((e as CustomEvent).detail)),
        );
      });
    });

    await page
      .locator('[data-question-id="q-planet"] .tessera-mc-option')
      .nth(1)
      .click();
    await page
      .locator('[data-question-id="q-water"] input[type="text"]')
      .fill('H2O');
    await page.locator('[data-testid="custom-quiz-submit"]').click();

    await expect(
      page.locator('[data-testid="custom-quiz-status"]'),
    ).toContainText('state: submitted');

    const events = await page.evaluate(
      () => (window as any).__tesseraQuizEvents,
    );
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ score: 100 });
    // Per-question reporting to the LMS is covered by custom-quiz-lms-roundtrip.spec.ts.
  });

  test('Quiz score persists to localStorage (Web adapter bridge fired)', async ({
    page,
  }) => {
    await navigateToExam(page);
    await page
      .locator('[data-question-id="q-planet"] .tessera-mc-option')
      .nth(1)
      .click();
    await page
      .locator('[data-question-id="q-water"] input[type="text"]')
      .fill('H2O');
    await page.locator('[data-testid="custom-quiz-submit"]').click();
    await expect(
      page.locator('[data-testid="custom-quiz-status"]'),
    ).toContainText('state: submitted');

    // The web adapter writes serialized state to localStorage. Read it back
    // and verify the quiz score made it into the saved state — the same code
    // path SCORM/cmi5 adapters take, just routed through a different sink.
    const saved = await page.evaluate(() => {
      const raw = Object.entries(localStorage).find(([k]) =>
        k.startsWith('tessera-'),
      )?.[1];
      return raw ? JSON.parse(raw) : null;
    });
    expect(saved).not.toBeNull();
    // q is the quiz scores map keyed by page index; the exam page is index 1.
    expect(saved.q['1']).toBe(100);
  });

  test('Retry resets state and bumps attempt count', async ({ page }) => {
    await navigateToExam(page);
    // Answer wrong on MC, right on fill-in
    await page
      .locator('[data-question-id="q-planet"] .tessera-mc-option')
      .nth(0)
      .click();
    await page
      .locator('[data-question-id="q-water"] input[type="text"]')
      .fill('H2O');
    await page.locator('[data-testid="custom-quiz-submit"]').click();
    await expect(
      page.locator('[data-testid="custom-quiz-status"]'),
    ).toContainText('attempts: 1');

    await page.locator('[data-testid="custom-quiz-retry"]').click();
    await expect(
      page.locator('[data-testid="custom-quiz-status"]'),
    ).toContainText('state: answering');
  });
});
