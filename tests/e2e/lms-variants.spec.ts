import { test, expect, type Page } from '@playwright/test';
import { execFile, type ChildProcess } from 'node:child_process';
import { installScorm12Mock } from './lms-mocks.js';
import { variantDir, viteBin, type FixtureName } from './global-setup.js';

/**
 * SCORM 1.2 roundtrips that `free` cannot host.
 *
 * The timing tests need graded review/never quizzes, and cmi.core.score.raw is
 * the *course* score — adding graded quizzes to `free` would move it for every
 * assertion in lms-roundtrip.spec.ts — so they run against the quiz-timing
 * fixture. The course-level axes below are one value per course.config.js, so
 * global-setup builds them as patched copies of `free`.
 */

function startPreview(fixture: FixtureName, port: number): ChildProcess {
  const dir = variantDir(fixture, 'scorm12');
  return execFile(
    viteBin(fixture),
    ['preview', dir, '--port', String(port), '--strictPort'],
    { cwd: dir },
  );
}

async function waitForServer(page: Page, url: string): Promise<void> {
  for (let i = 0; i < 30; i++) {
    try {
      const res = await page.request.get(url, { timeout: 1000 });
      if (res.ok()) return;
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Server at ${url} did not start within 15s`);
}

async function waitForTesseraContent(page: Page): Promise<void> {
  await page.waitForSelector('.tessera-content', { timeout: 15000 });
  await page
    .waitForFunction(
      () => !document.querySelector('.tessera-loading-skeleton'),
      { timeout: 5000 },
    )
    .catch(() => {});
}

async function passGradedQuiz(page: Page): Promise<void> {
  await page
    .locator('.tessera-nav-page', { hasText: 'Graded Assessment' })
    .click();
  await page.waitForSelector('.tessera-quiz', { timeout: 10000 });

  const primary = page.locator('.tessera-quiz-nav .tessera-btn-primary');
  // Immediate mode relabels the one primary button through the flow, so wait
  // on the label rather than sleeping: answering enables Submit (reveal), and
  // the reveal turns it into Next Question (advance).
  const reveal = async () => {
    await expect(primary).toHaveText(/Submit/);
    await primary.click();
    await expect(primary).toHaveText(/Next Question|See Results/);
  };
  const advance = async () => {
    await expect(primary).toHaveText(/Next Question/);
    await primary.click();
  };

  await page
    .locator('.tessera-quiz-question-wrapper.active .tessera-mc-option')
    .nth(1)
    .click();
  await reveal();
  await advance();

  await page
    .locator('.tessera-quiz-question-wrapper.active input[type="text"]')
    .fill('blue');
  await reveal();
  await advance();

  const active = page.locator('.tessera-quiz-question-wrapper.active');
  const left = active.locator('.tessera-matching-item.left');
  const right = active.locator('.tessera-matching-item.right');
  const targets: Record<string, string> = {
    '1': 'One',
    '2': 'Two',
    '3': 'Three',
  };
  const n = await left.count();
  for (let i = 0; i < n; i++) {
    const key = (await left.nth(i).textContent())?.trim() ?? '';
    const target = targets[key];
    if (!target) continue;
    await left.nth(i).click();
    await right.filter({ hasText: target }).first().click();
  }
  await reveal();

  const submit = page.locator('.tessera-quiz-btn-submit');
  await submit.waitFor({ state: 'visible', timeout: 5000 });
  await submit.click();
  await page.waitForSelector('.tessera-quiz-results', { timeout: 5000 });
}

async function snapshot(page: Page): Promise<Record<string, string>> {
  return page.evaluate(() => (window as any).__scormDataSnapshot());
}

/**
 * The adapter writes cmi.core.score.raw once per revealed question, so the
 * value climbs 33 → 67 → 100 and a snapshot taken on the first write is stale.
 * Poll the value itself rather than waiting for the key to appear at all.
 */
async function expectScormValue(
  page: Page,
  key: string,
  value: string,
): Promise<void> {
  await expect
    .poll(async () => (await snapshot(page))[key], { timeout: 8000 })
    .toBe(value);
}

async function waitForScormValue(page: Page, key: string): Promise<void> {
  await expect
    .poll(
      async () =>
        (
          (await page.evaluate(() => (window as any).__scormLog)) as string[][]
        ).some((e) => e[0] === 'LMSSetValue' && e[1] === key),
      { timeout: 8000 },
    )
    .toBe(true);
}

test.describe.serial('quiz reporting timing — review and never', () => {
  const PORT = 5296;
  const BASE = `http://localhost:${PORT}`;
  let preview: ChildProcess;

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(120_000);
    preview = startPreview('quiz-timing', PORT);
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
    await page.goto(BASE);
    await waitForTesseraContent(page);

    await page
      .locator('.tessera-nav-page', { hasText: 'Review Timing Quiz' })
      .click();
    await page.waitForSelector('.tessera-quiz', { timeout: 10000 });

    const interactionWrites = async () =>
      (
        (await page.evaluate(() => (window as any).__scormLog)) as string[][]
      ).filter(
        (e) => e[0] === 'LMSSetValue' && /^cmi\.interactions\./.test(e[1]),
      );

    const primary = page.locator('.tessera-quiz-nav .tessera-btn-primary');

    // Q1 — MultipleChoice, "Mercury" is index 1.
    await page
      .locator('.tessera-quiz-question-wrapper.active .tessera-mc-option')
      .nth(1)
      .click();
    await expect(primary).toHaveText(/Next/);
    await page.waitForTimeout(300);
    expect(await interactionWrites()).toEqual([]);
    await primary.click();
    await page.waitForTimeout(300);

    // Q2 — FillInTheBlank. Blurring the input used to commit the answer; the
    // PR removed that onblur commit, so the log must still be empty after it.
    const input = page.locator(
      '.tessera-quiz-question-wrapper.active input[type="text"]',
    );
    await input.fill('H2O');
    await input.blur();
    await page.waitForTimeout(300);
    expect(await interactionWrites()).toEqual([]);
    await primary.click();
    await page.waitForTimeout(300);

    // Q3 — Matching. Completing the last answer must not flip the button into
    // a reveal, and must not report anything on its own.
    const active = page.locator('.tessera-quiz-question-wrapper.active');
    const left = active.locator('.tessera-matching-item.left');
    const right = active.locator('.tessera-matching-item.right');
    const targets: Record<string, string> = {
      '1': 'One',
      '2': 'Two',
      '3': 'Three',
    };
    const n = await left.count();
    for (let i = 0; i < n; i++) {
      const key = (await left.nth(i).textContent())?.trim() ?? '';
      const target = targets[key];
      if (!target) continue;
      await left.nth(i).click();
      await right.filter({ hasText: target }).first().click();
      await page.waitForTimeout(100);
    }

    const submit = page.locator('.tessera-quiz-btn-submit');
    await submit.waitFor({ state: 'visible', timeout: 5000 });
    await page.waitForTimeout(300);
    expect(await interactionWrites()).toEqual([]);

    await submit.click();
    await page.waitForSelector('.tessera-quiz-results', { timeout: 5000 });

    // One index per question, all of them written by the single Submit.
    await expect
      .poll(
        () =>
          interactionWrites().then(
            (w) => new Set(w.map((e) => e[1].split('.')[2])).size,
          ),
        { timeout: 5000 },
      )
      .toBe(3);
  });

  test('Never mode has no reveal path and reports only on Submit', async ({
    page,
  }) => {
    await page.goto(BASE);
    await waitForTesseraContent(page);

    await page
      .locator('.tessera-nav-page', { hasText: 'Never Timing Quiz' })
      .click();
    await page.waitForSelector('.tessera-quiz', { timeout: 10000 });

    const interactionWrites = async () =>
      (
        (await page.evaluate(() => (window as any).__scormLog)) as string[][]
      ).filter(
        (e) => e[0] === 'LMSSetValue' && /^cmi\.interactions\./.test(e[1]),
      );

    const primary = page.locator('.tessera-quiz-nav .tessera-btn-primary');

    // Q1 — "7 continents" is index 2. Never mode offers no reveal, so the
    // button stays Next rather than becoming a mid-quiz Submit.
    await page
      .locator('.tessera-quiz-question-wrapper.active .tessera-mc-option')
      .nth(2)
      .click();
    await expect(primary).toHaveText(/Next/);
    await primary.click();
    await page.waitForTimeout(300);

    await page
      .locator('.tessera-quiz-question-wrapper.active input[type="text"]')
      .fill('Tokyo');

    const submit = page.locator('.tessera-quiz-btn-submit');
    await submit.waitFor({ state: 'visible', timeout: 5000 });
    await page.waitForTimeout(300);
    expect(await interactionWrites()).toEqual([]);

    await submit.click();
    await page.waitForSelector('.tessera-quiz-results', { timeout: 5000 });

    await expect
      .poll(
        () =>
          interactionWrites().then(
            (w) => new Set(w.map((e) => e[1].split('.')[2])).size,
          ),
        { timeout: 5000 },
      )
      .toBe(2);
  });
});

test.describe.serial("completion: { mode: 'quiz' }", () => {
  const PORT = 5297;
  const BASE = `http://localhost:${PORT}`;
  let preview: ChildProcess;

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(120_000);
    preview = startPreview('completion-quiz', PORT);
    const page = await browser.newPage();
    try {
      await waitForServer(page, BASE);
    } finally {
      await page.close();
    }
  });

  test.afterAll(() => preview?.kill('SIGTERM'));
  test.beforeEach(async ({ page }) => installScorm12Mock(page));

  test('the graded quiz alone drives completion, with no pages visited', async ({
    page,
  }) => {
    await page.goto(BASE);
    await waitForTesseraContent(page);
    await passGradedQuiz(page);

    await expectScormValue(page, 'cmi.core.score.raw', '100');
    // Under 'quiz' the quiz result is the completion signal — the learner has
    // seen only a fraction of the pages, which under 'percentage' would not
    // complete the course.
    await expectScormValue(page, 'cmi.core.lesson_status', 'passed');
  });
});

test.describe.serial("completion: { mode: 'manual' }", () => {
  const PORT = 5298;
  const BASE = `http://localhost:${PORT}`;
  let preview: ChildProcess;

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(120_000);
    preview = startPreview('completion-manual', PORT);
    const page = await browser.newPage();
    try {
      await waitForServer(page, BASE);
    } finally {
      await page.close();
    }
  });

  test.afterAll(() => preview?.kill('SIGTERM'));
  test.beforeEach(async ({ page }) => installScorm12Mock(page));

  test('the score still reports but the quiz does not complete the course', async ({
    page,
  }) => {
    await page.goto(BASE);
    await waitForTesseraContent(page);
    await passGradedQuiz(page);

    // Interactions and the score are transcript data and still land.
    await expectScormValue(page, 'cmi.core.score.raw', '100');
    // No page declares completesOn: 'view' and nothing calls markComplete(),
    // so completion is the host's to set, not the quiz's.
    const data = await snapshot(page);
    expect(data['cmi.core.lesson_status']).not.toBe('completed');
  });
});

test.describe.serial("resume: 'never'", () => {
  const PORT = 5299;
  const BASE = `http://localhost:${PORT}`;
  let preview: ChildProcess;

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(120_000);
    preview = startPreview('resume-never', PORT);
    const page = await browser.newPage();
    try {
      await waitForServer(page, BASE);
    } finally {
      await page.close();
    }
  });

  test.afterAll(() => preview?.kill('SIGTERM'));
  test.beforeEach(async ({ page }) => installScorm12Mock(page));

  test('a re-launch starts at the first page instead of the bookmark', async ({
    page,
  }) => {
    await page.goto(BASE);
    await waitForTesseraContent(page);

    await page
      .locator('.tessera-nav-page', { hasText: 'Callouts & Images' })
      .click();
    await waitForTesseraContent(page);
    await expect(page.locator('.tessera-content h1')).toContainText(
      'Callouts & Images',
    );
    await waitForScormValue(page, 'cmi.suspend_data');

    // Same reload the SCORM 1.2 bookmark test uses — there it restores the
    // bookmark; under resume: 'never' it must not.
    await page.reload();
    await waitForTesseraContent(page);
    await expect(page.locator('.tessera-content h1')).toContainText('Welcome');
  });
});
