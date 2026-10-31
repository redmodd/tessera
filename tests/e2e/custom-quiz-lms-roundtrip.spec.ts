import { expect, type Page } from '@playwright/test';
import { type ChildProcess } from 'node:child_process';
import {
  installCmi5Mock,
  installScorm12Mock,
  installScorm2004Mock,
  cmi5LaunchURL,
  test,
  xapiLaunchURL,
} from './lms-mocks.js';
import {
  exitCourse,
  findStatement,
  findStatements,
  interactionField,
  interactionWrites,
  scormData,
  scormLog,
  startPreview,
  waitForServer,
} from './helpers.js';

/**
 * Phase 5 Task 2 Step 4 — load-bearing custom-quiz LMS roundtrip.
 *
 * Mirrors `lms-roundtrip.spec.ts` but builds the *custom-quiz* fixture
 * (`tests/fixtures/custom-quiz/`) against each of the four LMS export
 * standards (SCORM 1.2 / SCORM 2004 / cmi5 / xAPI — no `web`, which has no
 * LMS to report to) and asserts that a project-supplied `quiz.svelte` reports
 * per-question interactions and a final score to every adapter the same way
 * the built-in `<Quiz>` does. Without this, the data contract for custom
 * shells has only unit-level coverage.
 */

async function waitForCustomQuiz(page: Page): Promise<void> {
  await page.waitForSelector('[data-testid="custom-quiz"]', { timeout: 15000 });
}

/** cmi.interactions.<n>.result values keyed by <n>: the survey has none. */
async function interactionResults(page: Page): Promise<Record<string, string>> {
  const writes = await interactionWrites(page);
  return Object.fromEntries(
    writes
      .filter(([, key]) => key.endsWith('.result'))
      .map(([, key, value]) => [key.split('.')[2], value]),
  );
}

/**
 * The custom-quiz fixture stacks every question on a single page with one
 * Submit button — no per-question Next/Continue cycling like the built-in.
 * Answer all three, click Submit, wait for the bridge to fire. The survey
 * question has no `correct`: it stays out of the score and reports no result.
 */
async function answerCustomQuiz(
  page: Page,
  { planetCorrect = true } = {},
): Promise<void> {
  await page.locator('.tessera-nav-page', { hasText: /^\s*Exam\s*$/ }).click();
  await waitForCustomQuiz(page);
  await page
    .locator('[data-question-id="q-planet"] .tessera-mc-option')
    .nth(planetCorrect ? 1 : 0)
    .click();
  await page
    .locator('[data-question-id="q-water"] input[type="text"]')
    .fill('H2O');
  await page.locator('[data-question-id="q-survey"] input').nth(1).check();
  await page.locator('[data-testid="custom-quiz-submit"]').click();
  await expect(
    page.locator('[data-testid="custom-quiz-status"]'),
  ).toContainText('state: submitted');
}

// ---------------------------------------------------------------------------
// SCORM 1.2
// ---------------------------------------------------------------------------

test.describe.serial('Custom-quiz LMS roundtrip — SCORM 1.2', () => {
  const PORT = 5295;
  const BASE = `http://localhost:${PORT}`;
  let preview: ChildProcess;

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(120_000);
    preview = startPreview('custom-quiz', 'scorm12', PORT);
    const page = await browser.newPage();
    try {
      await waitForServer(page, BASE);
    } finally {
      await page.close();
    }
  });

  test.afterAll(async () => {
    preview?.kill('SIGTERM');
  });

  test.beforeEach(async ({ page }) => {
    await installScorm12Mock(page);
  });

  test.afterEach(async ({ page }) => {
    const errors = await page.evaluate(
      () => (window as { __scormErrors?: unknown[] }).__scormErrors ?? [],
    );
    expect(errors).toEqual([]);
  });

  test('Custom quiz writes per-question cmi.interactions and final score', async ({
    page,
  }) => {
    await page.goto(BASE);
    // First page is intro; answerCustomQuiz navigates to the Exam
    // page and waits for the custom-quiz shell before answering.
    await answerCustomQuiz(page);

    await expect
      .poll(() => scormData(page))
      .toMatchObject({
        'cmi.core.score.raw': '100',
        'cmi.core.lesson_status': 'incomplete',
      });

    expect(await interactionField(page, 'type')).toEqual([
      'choice',
      'fill-in',
      'choice',
    ]);
    expect(await interactionField(page, 'id')).toEqual([
      'q_planet',
      'q_water',
      'q_survey',
    ]);
    expect(await interactionResults(page)).toEqual({
      '0': 'correct',
      '1': 'correct',
    });
  });

  test('a failing score holds lesson_status at incomplete until the course completes, then reports failed once per launch', async ({
    page,
  }) => {
    await page.goto(BASE);
    await answerCustomQuiz(page, { planetCorrect: false });

    await expect
      .poll(() => scormData(page))
      .toMatchObject({
        'cmi.core.score.raw': '50',
        'cmi.core.lesson_status': 'incomplete',
      });

    await page.locator('.tessera-nav-page', { hasText: 'Inline Exam' }).click();
    await page
      .locator('[data-question-id="q-inline-planet"] input')
      .nth(1)
      .check();
    await page
      .locator('[data-question-id="q-inline-ocean"] input')
      .nth(2)
      .check();
    await page.locator('[data-testid="custom-quiz-submit"]').click();

    const lessonStatusWrites = async () =>
      (await scormLog(page))
        .filter(
          ([fn, key]) =>
            fn === 'LMSSetValue' && key === 'cmi.core.lesson_status',
        )
        .map(([, , value]) => value);
    await expect.poll(lessonStatusWrites).toEqual(['incomplete', 'failed']);
    expect(await scormData(page)).toMatchObject({
      'cmi.core.score.raw': '50',
    });

    await page.reload();
    await waitForCustomQuiz(page);
    await exitCourse(page);

    expect(await lessonStatusWrites()).toEqual(['failed']);
  });
});

// ---------------------------------------------------------------------------
// SCORM 2004
// ---------------------------------------------------------------------------

test.describe.serial('Custom-quiz LMS roundtrip — SCORM 2004', () => {
  const PORT = 5296;
  const BASE = `http://localhost:${PORT}`;
  let preview: ChildProcess;

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(120_000);
    preview = startPreview('custom-quiz', 'scorm2004', PORT);
    const page = await browser.newPage();
    try {
      await waitForServer(page, BASE);
    } finally {
      await page.close();
    }
  });

  test.afterAll(async () => {
    preview?.kill('SIGTERM');
  });

  test.beforeEach(async ({ page }) => {
    await installScorm2004Mock(page);
  });

  test.afterEach(async ({ page }) => {
    const errors = await page.evaluate(
      () => (window as { __scormErrors?: unknown[] }).__scormErrors ?? [],
    );
    expect(errors).toEqual([]);
  });

  test('Custom quiz writes per-question cmi.interactions and holds passed for completion', async ({
    page,
  }) => {
    await page.goto(BASE);
    await answerCustomQuiz(page);

    await expect
      .poll(() => scormData(page))
      .toMatchObject({
        'cmi.score.raw': '100',
        'cmi.score.scaled': '1',
        'cmi.success_status': 'unknown',
      });

    expect(await interactionField(page, 'type')).toEqual([
      'choice',
      'fill-in',
      'choice',
    ]);
    expect(await interactionField(page, 'id')).toEqual([
      'q-planet',
      'q-water',
      'q-survey',
    ]);
    expect(await interactionResults(page)).toEqual({
      '0': 'correct',
      '1': 'correct',
    });
  });
});

// ---------------------------------------------------------------------------
// CMI5
// ---------------------------------------------------------------------------

test.describe.serial('Custom-quiz LMS roundtrip — CMI5', () => {
  const PORT = 5297;
  const BASE = `http://localhost:${PORT}`;
  let preview: ChildProcess;

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(120_000);
    preview = startPreview('custom-quiz', 'cmi5', PORT);
    const page = await browser.newPage();
    try {
      await waitForServer(page, BASE);
    } finally {
      await page.close();
    }
  });

  test.afterAll(async () => {
    preview?.kill('SIGTERM');
  });

  test('Custom quiz emits xAPI Scored and per-question Answered statements, holding Passed for completion', async ({
    page,
  }) => {
    const statements = await installCmi5Mock(page);

    await page.goto(cmi5LaunchURL(BASE));
    await answerCustomQuiz(page);

    await expect
      .poll(() => findStatement(statements, 'scored')?.result?.score?.scaled, {
        timeout: 5000,
      })
      .toBe(1);
    expect(findStatement(statements, 'passed')).toBeUndefined();

    const answered = findStatements(statements, 'answered');
    expect(answered).toHaveLength(3);
    expect(answered.map((s) => s.object?.definition?.interactionType)).toEqual([
      'choice',
      'fill-in',
      'choice',
    ]);
    expect(answered.map((s) => s.result?.success)).toEqual([
      true,
      true,
      undefined,
    ]);
  });
});

// ---------------------------------------------------------------------------
// Plain xAPI ("Tin Can") — launch params straight off the URL, no fetch token
// ---------------------------------------------------------------------------

test.describe.serial('Custom-quiz LMS roundtrip — xAPI', () => {
  const PORT = 5298;
  const BASE = `http://localhost:${PORT}`;
  let preview: ChildProcess;

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(120_000);
    preview = startPreview('custom-quiz', 'xapi', PORT);
    const page = await browser.newPage();
    try {
      await waitForServer(page, BASE);
    } finally {
      await page.close();
    }
  });

  test.afterAll(async () => {
    preview?.kill('SIGTERM');
  });

  test('Custom quiz emits xAPI Scored and per-question Answered statements, holding Passed for completion', async ({
    page,
  }) => {
    const statements: any[] = [];
    await page.route('http://xapi-mock.test/**', async (route) => {
      const req = route.request();
      const url = req.url();
      if (url.includes('/xapi/statements')) {
        if (req.method() === 'POST' || req.method() === 'PUT') {
          try {
            statements.push(JSON.parse(req.postData() ?? '{}'));
          } catch {}
        }
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(['stmt-id']),
        });
        return;
      }
      if (url.includes('/xapi/activities/state')) {
        await route.fulfill({ status: 404, body: '{}' });
        return;
      }
      await route.fulfill({ status: 200, body: '{}' });
    });

    await page.goto(xapiLaunchURL(BASE));
    await answerCustomQuiz(page);

    await expect
      .poll(() => findStatement(statements, 'scored')?.result?.score?.scaled, {
        timeout: 5000,
      })
      .toBe(1);
    expect(findStatement(statements, 'passed')).toBeUndefined();

    const answered = findStatements(statements, 'answered');
    expect(answered).toHaveLength(3);
    expect(answered.map((s) => s.object?.definition?.interactionType)).toEqual([
      'choice',
      'fill-in',
      'choice',
    ]);
    expect(answered.map((s) => s.result?.success)).toEqual([
      true,
      true,
      undefined,
    ]);
  });
});
