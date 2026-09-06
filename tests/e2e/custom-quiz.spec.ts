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
  await page.locator('.tessera-nav-page', { hasText: /^\s*Exam\s*$/ }).click();
  await page.waitForSelector('[data-testid="custom-quiz"]', { timeout: 10000 });
}

async function navigateToInlineExam(page: Page) {
  await page.locator('.tessera-nav-page', { hasText: 'Inline Exam' }).click();
  await page.waitForSelector('[data-testid="inline-heading"]', {
    timeout: 10000,
  });
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

/**
 * Inline layout: the shell renders `children` in place and never calls
 * `q.render()`. Widgets that skip `setRender` then sit in document order
 * between the page's own prose, which the snippet layout cannot express.
 */
test.describe('Custom quiz.svelte — inline layout', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.goto('/');
    await waitForContent(page);
  });

  test('page prose and inline widgets render interleaved, in document order', async ({
    page,
  }) => {
    await navigateToInlineExam(page);
    const pageContent = page.locator('[data-testid="custom-quiz-page"]');
    await expect(pageContent).toBeVisible();
    await expect(page.locator('[data-testid="inline-prose-2"]')).toBeVisible();

    const order = await pageContent.evaluate((el) =>
      [...el.querySelectorAll('[data-testid], [data-question-id]')].map(
        (n) =>
          n.getAttribute('data-testid') ?? n.getAttribute('data-question-id'),
      ),
    );
    expect(order).toEqual([
      'inline-heading',
      'inline-prose-1',
      'q-inline-planet',
      'inline-prose-2',
      'q-inline-ocean',
      'inline-prose-3',
    ]);
  });

  test('widgets that skip setRender still register, gate Submit, and score', async ({
    page,
  }) => {
    await navigateToInlineExam(page);
    // Nothing registered a snippet, so the shell's snippet list stays empty.
    await expect(
      page.locator('[data-testid="custom-quiz"] .custom-quiz-item'),
    ).toHaveCount(0);

    const submit = page.locator('[data-testid="custom-quiz-submit"]');
    await expect(submit).toBeDisabled();

    await page
      .locator('[data-question-id="q-inline-planet"] input')
      .nth(1)
      .check();
    await expect(submit).toBeDisabled();

    await page
      .locator('[data-question-id="q-inline-ocean"] input')
      .nth(2)
      .check();
    await expect(submit).toBeEnabled();

    await submit.click();
    await expect(
      page.locator('[data-testid="custom-quiz-status"]'),
    ).toContainText('state: submitted');
    await expect(
      page.locator('[data-testid="custom-quiz-status"]'),
    ).toContainText('score: 100');
  });
});
