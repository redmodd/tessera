import { expect, type Page } from '@playwright/test';
import { type ChildProcess } from 'node:child_process';
import {
  installScorm12Mock,
  installScorm2004Mock,
  cmi5LaunchURL,
  test,
  xapiLaunchURL,
} from './lms-mocks.js';
import {
  answerGradedQuiz,
  answerGradedQuizAfterQ1,
  exitCourse,
  findStatement,
  finishFreeCourse,
  interactionField,
  interactionWrites,
  openQuiz,
  reportedQuestionCount,
  scormData,
  scormLog,
  startPreview,
  waitForServer,
  waitForTesseraContent,
} from './helpers.js';

// ---------------------------------------------------------------------------
// SCORM 1.2
// ---------------------------------------------------------------------------

test.describe.serial('LMS round-trip — SCORM 1.2', () => {
  const PORT = 5192;
  const BASE = `http://localhost:${PORT}`;
  let preview: ChildProcess;

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(120_000);
    preview = startPreview('free', 'scorm12', PORT);
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

  test.beforeEach(async ({ page, lmsData }) => {
    await installScorm12Mock(page, lmsData);
  });

  test.afterEach(async ({ page }) => {
    const errors = await page.evaluate(
      () => (window as { __scormErrors?: unknown[] }).__scormErrors ?? [],
    );
    expect(errors).toEqual([]);
  });

  test('Initialize fires and course boots against mock API', async ({
    page,
  }) => {
    await page.goto(BASE);
    await waitForTesseraContent(page);

    const log = await scormLog(page);
    const verbs = log.map((entry) => entry[0]);
    expect(verbs).toContain('LMSInitialize');
    expect(log).toContainEqual([
      'LMSGetValue',
      'cmi.suspend_data',
      expect.any(String),
    ]);
  });

  test('Navigation writes suspend_data containing bookmark and visited pages', async ({
    page,
  }) => {
    await page.goto(BASE);
    await waitForTesseraContent(page);

    await page.locator('.tessera-nav-page', { hasText: 'Objectives' }).click();
    await waitForTesseraContent(page);
    await page
      .locator('.tessera-nav-page', { hasText: 'Callouts & Images' })
      .click();
    await waitForTesseraContent(page);

    // Poll suspend_data until all three visits are reflected — the writeQueue is
    // async and the final `markVisited` may land after the navigation completes.
    await expect
      .poll(
        async () => {
          const raw = (await scormData(page))['cmi.suspend_data'];
          if (!raw) return 0;
          try {
            const state = JSON.parse(raw);
            return Array.isArray(state.v) ? state.v.length : 0;
          } catch {
            return 0;
          }
        },
        { timeout: 5000 },
      )
      .toBeGreaterThanOrEqual(3);

    const data = await scormData(page);
    const state = JSON.parse(data['cmi.suspend_data']);
    expect(state).toHaveProperty('b');
    expect(state.b).toBeGreaterThan(0); // not on first page
  });

  test('Re-launch: reload uses suspend_data to restore bookmark', async ({
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

    await expect
      .poll(() => scormLog(page))
      .toContainEqual(['LMSSetValue', 'cmi.suspend_data', expect.any(String)]);

    // Simulate re-launch by reloading the page. sessionStorage preserves mock
    // data across the reload, which is what the LMS would do.
    await page.reload();
    await waitForTesseraContent(page);

    // After re-launch we should land on the same page the learner left on.
    await expect(page.locator('.tessera-content h1')).toContainText(
      'Callouts & Images',
    );
  });

  test('Completing a graded quiz writes the score and holds lesson_status at incomplete', async ({
    page,
  }) => {
    await page.goto(BASE);
    await waitForTesseraContent(page);

    await openQuiz(page, 'Graded Assessment');

    // Q1: "What is 2 + 2?" → option index 1 ("4")
    await page
      .locator('.tessera-quiz-question-wrapper.active .tessera-mc-option')
      .nth(1)
      .click();

    await page.waitForTimeout(300);
    expect(await interactionWrites(page)).toEqual([]);

    const primary = page.locator('.tessera-quiz-nav .tessera-btn-primary');
    await primary.click(); // immediate feedback
    await expect
      .poll(() => interactionWrites(page).then((w) => w.length), {
        timeout: 5000,
      })
      .toBeGreaterThan(0);
    await expect(primary).toHaveText('Next Question');
    await primary.click(); // continue

    await answerGradedQuizAfterQ1(page);
    const submit = page.locator('.tessera-quiz-btn-submit');

    // Every answer was revealed, so every answer is already reported.
    await expect
      .poll(() => reportedQuestionCount(page), { timeout: 5000 })
      .toBe(3);

    await submit.click();
    await page.waitForSelector('.tessera-quiz-results', { timeout: 5000 });

    await expect
      .poll(() => scormData(page))
      .toMatchObject({
        'cmi.core.score.raw': '100',
        'cmi.core.score.min': '0',
        'cmi.core.score.max': '100',
        // Passing the quiz does not finish a percentage course, and SCORM 1.2
        // has one field: "passed" here would read as finished.
        'cmi.core.lesson_status': 'incomplete',
      });

    // Per-question Interaction writes land before the final score, so by now
    // each built-in must have emitted cmi.interactions.<n>.id / .type.
    expect(await interactionField(page, 'type')).toEqual([
      'choice',
      'fill-in',
      'matching',
    ]);

    const idWrites = await interactionField(page, 'id');
    expect(idWrites).toHaveLength(3);
    for (const id of idWrites) expect(id.length).toBeGreaterThan(0);
  });

  test('Exit flushes session_time in HHHH:MM:SS.SS format and calls LMSFinish', async ({
    page,
  }) => {
    await page.goto(BASE);
    await waitForTesseraContent(page);

    await page.locator('.tessera-nav-page', { hasText: 'Objectives' }).click();
    await waitForTesseraContent(page);
    await page.waitForTimeout(1100); // accumulate at least one whole second

    await exitCourse(page);

    // Assert the adapter's written format from the call log: scorm-again
    // normalizes session_time on storage, so the snapshot is not verbatim.
    const log = await scormLog(page);
    const sessionTimeWrite = log.find(
      (entry) =>
        entry[0] === 'LMSSetValue' && entry[1] === 'cmi.core.session_time',
    );
    expect(sessionTimeWrite?.[2]).toMatch(/^\d{4}:\d{2}:\d{2}\.\d{2}$/);
    expect(log.some((entry) => entry[0] === 'LMSFinish')).toBe(true);
  });

  test.describe('LMS mastery_score', () => {
    test.use({ lmsData: { 'cmi.student_data.mastery_score': '60' } });

    test('a 66.67 escapes failed against mastery_score 60 despite passingScore 70', async ({
      page,
    }) => {
      await page.goto(BASE);
      await waitForTesseraContent(page);
      await openQuiz(page, 'Graded Assessment');

      await answerGradedQuiz(page, { q1Correct: false });

      // Without the override a 66.67 against passingScore 70 would be failed,
      // and failed is not held back the way passed is.
      await expect
        .poll(() => scormData(page))
        .toMatchObject({
          'cmi.core.lesson_status': 'incomplete',
          'cmi.core.score.raw': '66.67',
        });
    });
  });

  test.describe('LMS mastery_score above the score', () => {
    test.use({
      lmsData: {
        'cmi.core.credit': 'credit',
        'cmi.student_data.mastery_score': '67',
      },
    });

    test('a 66.67 stays failed against mastery_score 67 after the LMS rescores on exit', async ({
      page,
    }) => {
      await page.goto(BASE);
      await waitForTesseraContent(page);
      await openQuiz(page, 'Graded Assessment');

      await answerGradedQuiz(page, { q1Correct: false });

      const failed = {
        'cmi.core.lesson_status': 'failed',
        'cmi.core.score.raw': '66.67',
      };
      await expect.poll(() => scormData(page)).toMatchObject(failed);

      await exitCourse(page);

      expect(await scormData(page)).toMatchObject(failed);
    });
  });
});

// ---------------------------------------------------------------------------
// SCORM 2004
// ---------------------------------------------------------------------------

test.describe.serial('LMS round-trip — SCORM 2004', () => {
  const PORT = 5193;
  const BASE = `http://localhost:${PORT}`;
  let preview: ChildProcess;

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(120_000);
    preview = startPreview('free', 'scorm2004', PORT);
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

  test.beforeEach(async ({ page, lmsData }) => {
    await installScorm2004Mock(page, lmsData);
  });

  test.afterEach(async ({ page }) => {
    const errors = await page.evaluate(
      () => (window as { __scormErrors?: unknown[] }).__scormErrors ?? [],
    );
    expect(errors).toEqual([]);
  });

  test('Initialize + GetValue(cmi.suspend_data) fires on boot', async ({
    page,
  }) => {
    await page.goto(BASE);
    await waitForTesseraContent(page);

    const log = await scormLog(page);
    const verbs = log.map((entry) => entry[0]);
    expect(verbs).toContain('Initialize');

    const gets = log
      .filter((entry) => entry[0] === 'GetValue')
      .map((entry) => entry[1]);
    expect(gets).toContain('cmi.suspend_data');
  });

  test('Re-launch via reload restores bookmark from suspend_data', async ({
    page,
  }) => {
    await page.goto(BASE);
    await waitForTesseraContent(page);

    await page
      .locator('.tessera-nav-page', { hasText: 'Accordion & Carousel' })
      .click();
    await waitForTesseraContent(page);
    await expect(page.locator('.tessera-content h1')).toContainText(
      'Accordion & Carousel',
    );

    await expect
      .poll(() => scormLog(page))
      .toContainEqual(['SetValue', 'cmi.suspend_data', expect.any(String)]);

    await page.reload();
    await waitForTesseraContent(page);
    await expect(page.locator('.tessera-content h1')).toContainText(
      'Accordion & Carousel',
    );
  });

  test('Graded quiz writes the score and holds passed until the course completes', async ({
    page,
  }) => {
    await page.goto(BASE);
    await waitForTesseraContent(page);

    await openQuiz(page, 'Graded Assessment');

    await answerGradedQuiz(page);

    await expect
      .poll(() => scormData(page))
      .toMatchObject({
        'cmi.score.raw': '100',
        'cmi.score.scaled': '1',
        // This course completes on percentage, so the pass waits; the
        // completion-quiz variant in lms-variants.spec.ts completes on it.
        'cmi.success_status': 'unknown',
        'cmi.completion_status': 'incomplete',
      });

    // Per-question Interaction writes: 2004 emits the SCORM vocab verbatim.
    expect(await interactionField(page, 'type')).toEqual([
      'choice',
      'fill-in',
      'matching',
    ]);

    const idWrites = await interactionField(page, 'id');
    expect(idWrites).toHaveLength(3);
    for (const id of idWrites) expect(id.length).toBeGreaterThan(0);
  });

  test('Exit flushes session_time in ISO 8601 format and calls Terminate', async ({
    page,
  }) => {
    await page.goto(BASE);
    await waitForTesseraContent(page);

    await page.locator('.tessera-nav-page', { hasText: 'Objectives' }).click();
    await waitForTesseraContent(page);
    await page.waitForTimeout(1100);

    await exitCourse(page);

    const data = await scormData(page);
    expect(data['cmi.session_time']).toMatch(/^PT(\d+H)?(\d+M)?(\d+S)?$/);

    const log = await scormLog(page);
    expect(log.some((entry) => entry[0] === 'Terminate')).toBe(true);
  });

  test.describe('LMS scaled_passing_score', () => {
    test.use({ lmsData: { 'cmi.scaled_passing_score': '0.6' } });

    test('a 66.67 passes against scaled_passing_score 0.6 despite passingScore 70', async ({
      page,
    }) => {
      await page.goto(BASE);
      await waitForTesseraContent(page);
      await openQuiz(page, 'Graded Assessment');

      await answerGradedQuiz(page, { q1Correct: false });
      await finishFreeCourse(page);

      await expect
        .poll(() => scormData(page))
        .toMatchObject({
          'cmi.success_status': 'passed',
          'cmi.score.raw': '66.67',
          'cmi.score.scaled': '0.6667',
        });
    });
  });
});

// ---------------------------------------------------------------------------
// CMI5 — xAPI statements via mocked fetch + statement endpoint
// ---------------------------------------------------------------------------

test.describe.serial('LMS round-trip — CMI5', () => {
  const PORT = 5194;
  const BASE = `http://localhost:${PORT}`;
  let preview: ChildProcess;

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(120_000);
    preview = startPreview('free', 'cmi5', PORT);
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

  test('launch with CMI5 params sends Initialized statement', async ({
    page,
  }) => {
    // Track xAPI statements sent by the course
    const statements: any[] = [];
    let tokenRequests = 0;

    await page.route('http://cmi5-mock.test/**', async (route) => {
      const req = route.request();
      const url = req.url();
      if (url.endsWith('/fetch')) {
        tokenRequests++;
        // Adapter parses the response body as text and strips `auth-token=` prefix
        await route.fulfill({
          status: 200,
          contentType: 'text/plain',
          body: 'auth-token=test-token-abc',
        });
        return;
      }
      if (url.includes('/xapi/statements')) {
        if (req.method() === 'POST' || req.method() === 'PUT') {
          try {
            statements.push(JSON.parse(req.postData() ?? '{}'));
          } catch {}
        }
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(['statement-id-1']),
        });
        return;
      }
      if (url.includes('/xapi/activities/state')) {
        // No saved state on first launch
        await route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: '{}',
        });
        return;
      }
      await route.fulfill({ status: 200, body: '{}' });
    });

    await page.goto(cmi5LaunchURL(BASE));
    await waitForTesseraContent(page);

    // Give the adapter a moment to fire the Initialized statement
    await page.waitForTimeout(500);

    expect(tokenRequests).toBeGreaterThanOrEqual(1);

    // Find an Initialized statement
    const initStmt = findStatement(statements, 'initialized');
    expect(initStmt).toBeTruthy();
    expect(initStmt.actor?.account?.name).toBe('learner-1');
    expect(initStmt.object?.id).toBe('http://tessera.test/activity/course-1');
    expect(initStmt.context?.registration).toBe('test-registration-123');
  });

  test('passing a graded quiz sends a Passed statement once the course completes', async ({
    page,
  }) => {
    const statements: any[] = [];

    await page.route('http://cmi5-mock.test/**', async (route) => {
      const url = route.request().url();
      if (url.endsWith('/fetch')) {
        await route.fulfill({
          status: 200,
          contentType: 'text/plain',
          body: 'auth-token=test-token-abc',
        });
        return;
      }
      if (url.includes('/xapi/statements')) {
        const req = route.request();
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

    await page.goto(cmi5LaunchURL(BASE));
    await waitForTesseraContent(page);

    await openQuiz(page, 'Graded Assessment');

    await answerGradedQuiz(page);

    await expect
      .poll(() => findStatement(statements, 'scored'), { timeout: 5000 })
      .toBeDefined();
    expect(findStatement(statements, 'passed')).toBeUndefined();

    // Per-question xAPI `answered` statements: one per built-in, carrying the
    // SCORM interaction vocabulary on the activity definition.
    const answered = statements.filter(
      (s) => s?.verb?.id === 'http://adlnet.gov/expapi/verbs/answered',
    );
    expect(answered).toHaveLength(3);
    expect(answered.map((s) => s.object?.definition?.interactionType)).toEqual([
      'choice',
      'fill-in',
      'matching',
    ]);
    for (const s of answered) {
      expect(String(s.object?.id)).toMatch(
        /^http:\/\/tessera\.test\/activity\/course-1#/,
      );
      expect(s.result?.response).toBeTruthy();
    }

    await finishFreeCourse(page);

    await expect
      .poll(() => findStatement(statements, 'passed'), { timeout: 5000 })
      .toBeDefined();

    const passed = findStatement(statements, 'passed');
    expect(passed.result?.success).toBe(true);
    expect(passed.result?.score?.scaled).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Plain xAPI ("Tin Can") — launch params straight off the URL, no fetch token
// ---------------------------------------------------------------------------

test.describe.serial('LMS round-trip — xAPI', () => {
  const PORT = 5195;
  const BASE = `http://localhost:${PORT}`;
  let preview: ChildProcess;

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(120_000);
    preview = startPreview('free', 'xapi', PORT);
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

  /** Route the mock LRS, capturing posted statements and the request headers. */
  async function routeLRS(
    page: Page,
    statements: any[],
    headers: Array<Record<string, string>>,
  ): Promise<void> {
    await page.route('http://xapi-mock.test/**', async (route) => {
      const req = route.request();
      const url = req.url();
      if (url.includes('/xapi/statements')) {
        headers.push(req.headers());
        if (req.method() === 'POST' || req.method() === 'PUT') {
          try {
            statements.push(...[JSON.parse(req.postData() ?? '{}')].flat());
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
        // No saved state on first launch, and no fetch-token endpoint exists.
        await route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: '{}',
        });
        return;
      }
      await route.fulfill({ status: 200, body: '{}' });
    });
  }

  /** `stateGet` scripts the resume read; `statePuts` collects attempted writes. */
  async function routeLRSWithState(
    page: Page,
    stateGet: { status: number; body: string },
    statePuts: string[],
  ): Promise<void> {
    await page.route('http://xapi-mock.test/**', async (route) => {
      const req = route.request();
      const url = req.url();
      if (url.includes('/xapi/statements')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(['stmt-id']),
        });
        return;
      }
      if (url.includes('/xapi/activities/state')) {
        if (req.method() === 'PUT') {
          statePuts.push(req.postData() ?? '');
          await route.fulfill({ status: 204, body: '' });
          return;
        }
        await route.fulfill({
          status: stateGet.status,
          contentType: 'application/json',
          body: stateGet.body,
        });
        return;
      }
      await route.fulfill({ status: 200, body: '{}' });
    });
  }

  test('resumes the bookmarked page from a populated State API', async ({
    page,
  }) => {
    // The blob is produced by a real save so it carries the fixture's own
    // structure fingerprint, which the resume gate now requires.
    const stateGet = { status: 404, body: '{}' };
    const statePuts: string[] = [];
    await routeLRSWithState(page, stateGet, statePuts);

    await page.goto(xapiLaunchURL(BASE));
    await waitForTesseraContent(page);
    await page
      .locator('.tessera-nav-page', { hasText: 'Accordion & Carousel' })
      .click();
    await waitForTesseraContent(page);
    await expect
      .poll(() => JSON.parse(statePuts.at(-1) ?? '{}').b)
      .toBeGreaterThan(0);

    const saved = statePuts.at(-1)!;
    expect(JSON.parse(saved).f).toBeTruthy();
    stateGet.status = 200;
    stateGet.body = saved;

    await page.goto(xapiLaunchURL(BASE));
    await waitForTesseraContent(page);

    await expect(page.locator('.tessera-content h1')).toContainText(
      'Accordion & Carousel',
    );
  });

  test('a failed resume GET still launches the course and never overwrites state', async ({
    page,
  }) => {
    const statePuts: string[] = [];
    await routeLRSWithState(page, { status: 500, body: '{}' }, statePuts);

    await page.goto(xapiLaunchURL(BASE));
    await waitForTesseraContent(page);
    await expect(page.locator('.tessera-content h1')).toContainText('Welcome');

    // Navigating is what normally triggers a save.
    await page.locator('.tessera-nav-page', { hasText: 'Objectives' }).click();
    await waitForTesseraContent(page);
    await page.waitForTimeout(500);
    expect(statePuts).toHaveLength(0);
  });

  test('launch sends Initialized with the 1.0.3 version header and verbatim Basic auth', async ({
    page,
  }) => {
    const statements: any[] = [];
    const headers: Array<Record<string, string>> = [];
    await routeLRS(page, statements, headers);

    await page.goto(xapiLaunchURL(BASE));
    await waitForTesseraContent(page);
    await page.waitForTimeout(500);

    const initStmt = findStatement(statements, 'initialized');
    expect(initStmt).toBeTruthy();
    expect(initStmt.actor?.account?.name).toBe('learner-1');
    expect(initStmt.object?.id).toBe('http://tessera.test/activity/course-1');
    expect(initStmt.context?.registration).toBe('test-registration-xapi');

    // Every statement request declares xAPI 1.0.3 and the Basic credential
    // (the launch `auth` header value, with its scheme normalized).
    expect(headers.length).toBeGreaterThan(0);
    expect(
      headers.every((h) => h['x-experience-api-version'] === '1.0.3'),
    ).toBe(true);
    expect(
      headers.every((h) => h['authorization'] === 'Basic dGVzdDp0ZXN0'),
    ).toBe(true);
  });

  test('passing a graded quiz sends Passed + Answered once the course completes, and pagehide sends Terminated', async ({
    page,
  }) => {
    const statements: any[] = [];
    const headers: Array<Record<string, string>> = [];
    await routeLRS(page, statements, headers);

    await page.goto(xapiLaunchURL(BASE));
    await waitForTesseraContent(page);

    await openQuiz(page, 'Graded Assessment');

    await page
      .locator('.tessera-quiz-question-wrapper.active .tessera-mc-option')
      .nth(1)
      .click();

    const answeredSoFar = () =>
      statements.filter(
        (s) => s?.verb?.id === 'http://adlnet.gov/expapi/verbs/answered',
      );
    await page.waitForTimeout(300);
    expect(answeredSoFar()).toEqual([]);

    const primary = page.locator('.tessera-quiz-nav .tessera-btn-primary');
    await primary.click();
    await expect.poll(() => answeredSoFar().length, { timeout: 5000 }).toBe(1);
    await expect(primary).toHaveText('Next Question');
    await primary.click();

    await answerGradedQuizAfterQ1(page);
    const submit = page.locator('.tessera-quiz-btn-submit');

    // Every answer was revealed, so every answer is already reported.
    await expect.poll(() => answeredSoFar().length, { timeout: 5000 }).toBe(3);

    await submit.click();
    await page.waitForSelector('.tessera-quiz-results', { timeout: 5000 });

    await expect
      .poll(() => findStatement(statements, 'scored'), { timeout: 5000 })
      .toBeDefined();
    expect(findStatement(statements, 'passed')).toBeUndefined();

    const answered = answeredSoFar();
    expect(answered).toHaveLength(3);
    expect(answered.map((s) => s.object?.definition?.interactionType)).toEqual([
      'choice',
      'fill-in',
      'matching',
    ]);

    await finishFreeCourse(page);

    await expect
      .poll(() => findStatement(statements, 'passed'), { timeout: 5000 })
      .toBeDefined();

    const passed = findStatement(statements, 'passed');
    expect(passed.result?.success).toBe(true);
    expect(passed.result?.score?.scaled).toBe(1);
    // Plain xAPI carries the launch registration but none of cmi5's Defined-
    // Statement context (no cmi5/moveOn Category Activity).
    expect(passed.context?.registration).toBe('test-registration-xapi');
    expect(passed.context?.contextActivities?.category).toBeUndefined();

    await exitCourse(page);
    await expect
      .poll(() => findStatement(statements, 'terminated'), { timeout: 5000 })
      .toBeTruthy();
  });
});
