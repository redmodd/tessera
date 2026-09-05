import { test, expect, type Page } from '@playwright/test';
import { execFile, type ChildProcess } from 'node:child_process';
import {
  installScorm12Mock,
  installScorm2004Mock,
  cmi5LaunchURL,
  xapiLaunchURL,
} from './lms-mocks.js';
import {
  interactionWrites,
  reportedQuestionCount,
  waitForServer,
  waitForTesseraContent,
} from './helpers.js';
import { variantDir, viteBin, type Standard } from './global-setup.js';

function startPreview(standard: Standard, port: number): ChildProcess {
  const dir = variantDir('free', standard);
  return execFile(
    viteBin('free'),
    ['preview', dir, '--port', String(port), '--strictPort'],
    { cwd: dir },
  );
}

/**
 * Wait until the SCORM mock has received at least one LMSCommit / Commit
 * for the given value predicate. The adapter's write queue is async, so we
 * poll the log after interactions rather than sleeping a fixed amount.
 */
async function waitForScormCall(
  page: Page,
  predicate: (entry: string[]) => boolean,
  timeoutMs = 5000,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const matched = await page.evaluate((pred: string) => {
      const log = (window as any).__scormLog || [];
      const fn = new Function('entry', `return (${pred})(entry)`);
      return log.some((entry: string[]) => fn(entry));
    }, predicate.toString());
    if (matched) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('Timed out waiting for SCORM call');
}

// ---------------------------------------------------------------------------
// SCORM 1.2
// ---------------------------------------------------------------------------

test.describe.serial('LMS round-trip — SCORM 1.2', () => {
  const PORT = 5192;
  const BASE = `http://localhost:${PORT}`;
  let preview: ChildProcess;

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(120_000);
    preview = startPreview('scorm12', PORT);
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

  test('Initialize fires and course boots against mock API', async ({
    page,
  }) => {
    await page.goto(BASE);
    await waitForTesseraContent(page);

    const log = (await page.evaluate(
      () => (window as any).__scormLog,
    )) as string[][];
    const verbs = log.map((entry) => entry[0]);
    expect(verbs).toContain('LMSInitialize');
    // First read after init should be suspend_data
    expect(verbs).toContain('LMSGetValue');
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
          const data = await page.evaluate(() =>
            (window as any).__scormDataSnapshot(),
          );
          const raw = data['cmi.suspend_data'];
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

    const data = await page.evaluate(() =>
      (window as any).__scormDataSnapshot(),
    );
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

    await waitForScormCall(
      page,
      (e) => e[0] === 'LMSSetValue' && e[1] === 'cmi.suspend_data',
    );

    // Simulate re-launch by reloading the page. sessionStorage preserves mock
    // data across the reload, which is what the LMS would do.
    await page.reload();
    await waitForTesseraContent(page);

    // After re-launch we should land on the same page the learner left on.
    await expect(page.locator('.tessera-content h1')).toContainText(
      'Callouts & Images',
    );
  });

  test('Completing a graded quiz writes score and lesson_status=passed', async ({
    page,
  }) => {
    await page.goto(BASE);
    await waitForTesseraContent(page);

    await page
      .locator('.tessera-nav-page', { hasText: 'Graded Assessment' })
      .click();
    await page.waitForSelector('.tessera-quiz', { timeout: 10000 });

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
    await primary.click(); // continue
    await page.waitForTimeout(300);

    // Q2: FillInTheBlank — "blue"
    await page
      .locator('.tessera-quiz-question-wrapper.active input[type="text"]')
      .fill('blue');
    await primary.click();
    await page.waitForTimeout(300);
    await primary.click();
    await page.waitForTimeout(300);

    // Q3: Matching 1→One, 2→Two, 3→Three
    const active = page.locator('.tessera-quiz-question-wrapper.active');
    const left = active.locator('.tessera-matching-item.left');
    const right = active.locator('.tessera-matching-item.right');
    const n = await left.count();
    const targets: Record<string, string> = {
      '1': 'One',
      '2': 'Two',
      '3': 'Three',
    };
    for (let i = 0; i < n; i++) {
      const key = (await left.nth(i).textContent())?.trim() ?? '';
      const target = targets[key];
      if (!target) continue;
      await left.nth(i).click();
      await right.filter({ hasText: target }).first().click();
      await page.waitForTimeout(100);
    }
    await primary.click();
    await page.waitForTimeout(300);

    const submit = page.locator('.tessera-quiz-btn-submit');
    await submit.waitFor({ state: 'visible', timeout: 5000 });

    // Every answer was revealed, so every answer is already reported.
    await expect
      .poll(() => reportedQuestionCount(page), { timeout: 5000 })
      .toBe(3);

    await submit.click();
    await page.waitForSelector('.tessera-quiz-results', { timeout: 5000 });

    // Wait for the SCORM score to be committed
    await waitForScormCall(
      page,
      (e) => e[0] === 'LMSSetValue' && e[1] === 'cmi.core.score.raw',
    );

    const data = await page.evaluate(() =>
      (window as any).__scormDataSnapshot(),
    );
    expect(data['cmi.core.score.raw']).toBe('100');
    expect(data['cmi.core.score.min']).toBe('0');
    expect(data['cmi.core.score.max']).toBe('100');
    // All answers correct → lesson_status should reflect passed (success takes priority)
    expect(data['cmi.core.lesson_status']).toBe('passed');

    // Per-question Interaction writes land before the final score, so by now
    // each built-in must have emitted cmi.interactions.<n>.id / .type.
    const log = (await page.evaluate(
      () => (window as any).__scormLog,
    )) as string[][];
    const typeWrites = log
      .filter(
        (e) =>
          e[0] === 'LMSSetValue' && /^cmi\.interactions\.\d+\.type$/.test(e[1]),
      )
      .map((e) => e[2]);
    expect(typeWrites).toEqual(['choice', 'fill-in', 'matching']);

    const idWrites = log
      .filter(
        (e) =>
          e[0] === 'LMSSetValue' && /^cmi\.interactions\.\d+\.id$/.test(e[1]),
      )
      .map((e) => e[2]);
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

    // Dispatch pagehide synchronously — the exit handler drains the queue
    // synchronously via drainSync(), so by the time this returns the mock
    // has the final session_time and LMSFinish call.
    await page.evaluate(() => {
      window.dispatchEvent(
        new PageTransitionEvent('pagehide', { persisted: false }),
      );
    });

    // Assert the adapter's written format from the call log: scorm-again
    // normalizes session_time on storage, so the snapshot is not verbatim.
    const log = (await page.evaluate(
      () => (window as any).__scormLog,
    )) as string[][];
    const sessionTimeWrite = log.find(
      (entry) =>
        entry[0] === 'LMSSetValue' && entry[1] === 'cmi.core.session_time',
    );
    expect(sessionTimeWrite?.[2]).toMatch(/^\d{4}:\d{2}:\d{2}\.\d{2}$/);
    expect(log.some((entry) => entry[0] === 'LMSFinish')).toBe(true);
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
    preview = startPreview('scorm2004', PORT);
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

  test('Initialize + GetValue(cmi.suspend_data) fires on boot', async ({
    page,
  }) => {
    await page.goto(BASE);
    await waitForTesseraContent(page);

    const log = (await page.evaluate(
      () => (window as any).__scormLog,
    )) as string[][];
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

    await waitForScormCall(
      page,
      (e) => e[0] === 'SetValue' && e[1] === 'cmi.suspend_data',
    );

    await page.reload();
    await waitForTesseraContent(page);
    await expect(page.locator('.tessera-content h1')).toContainText(
      'Accordion & Carousel',
    );
  });

  test('Graded quiz writes split completion_status and success_status', async ({
    page,
  }) => {
    await page.goto(BASE);
    await waitForTesseraContent(page);

    await page
      .locator('.tessera-nav-page', { hasText: 'Graded Assessment' })
      .click();
    await page.waitForSelector('.tessera-quiz', { timeout: 10000 });

    // Answer Q1 correctly
    await page
      .locator('.tessera-quiz-question-wrapper.active .tessera-mc-option')
      .nth(1)
      .click();
    const primary = page.locator('.tessera-quiz-nav .tessera-btn-primary');
    await primary.click();
    await page.waitForTimeout(300);
    await primary.click();
    await page.waitForTimeout(300);

    // Answer Q2 correctly
    await page
      .locator('.tessera-quiz-question-wrapper.active input[type="text"]')
      .fill('blue');
    await primary.click();
    await page.waitForTimeout(300);
    await primary.click();
    await page.waitForTimeout(300);

    // Answer Q3 correctly
    const active = page.locator('.tessera-quiz-question-wrapper.active');
    const left = active.locator('.tessera-matching-item.left');
    const right = active.locator('.tessera-matching-item.right');
    const n = await left.count();
    const targets: Record<string, string> = {
      '1': 'One',
      '2': 'Two',
      '3': 'Three',
    };
    for (let i = 0; i < n; i++) {
      const key = (await left.nth(i).textContent())?.trim() ?? '';
      const target = targets[key];
      if (!target) continue;
      await left.nth(i).click();
      await right.filter({ hasText: target }).first().click();
      await page.waitForTimeout(100);
    }
    await primary.click();
    await page.waitForTimeout(300);

    const submit = page.locator('.tessera-quiz-btn-submit');
    await submit.waitFor({ state: 'visible', timeout: 5000 });
    await submit.click();
    await page.waitForSelector('.tessera-quiz-results', { timeout: 5000 });

    await waitForScormCall(
      page,
      (e) => e[0] === 'SetValue' && e[1] === 'cmi.score.raw',
    );

    const data = await page.evaluate(() =>
      (window as any).__scormDataSnapshot(),
    );
    expect(data['cmi.score.raw']).toBe('100');
    expect(data['cmi.score.scaled']).toBe('1');
    // SCORM 2004 keeps completion and success as separate fields
    expect(data['cmi.success_status']).toBe('passed');

    // Per-question Interaction writes: 2004 emits the SCORM vocab verbatim.
    const log = (await page.evaluate(
      () => (window as any).__scormLog,
    )) as string[][];
    const typeWrites = log
      .filter(
        (e) =>
          e[0] === 'SetValue' && /^cmi\.interactions\.\d+\.type$/.test(e[1]),
      )
      .map((e) => e[2]);
    expect(typeWrites).toEqual(['choice', 'fill-in', 'matching']);

    const idWrites = log
      .filter(
        (e) => e[0] === 'SetValue' && /^cmi\.interactions\.\d+\.id$/.test(e[1]),
      )
      .map((e) => e[2]);
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

    await page.evaluate(() => {
      window.dispatchEvent(
        new PageTransitionEvent('pagehide', { persisted: false }),
      );
    });

    const data = await page.evaluate(() =>
      (window as any).__scormDataSnapshot(),
    );
    expect(data['cmi.session_time']).toMatch(/^PT(\d+H)?(\d+M)?(\d+S)?$/);

    const log = (await page.evaluate(
      () => (window as any).__scormLog,
    )) as string[][];
    expect(log.some((entry) => entry[0] === 'Terminate')).toBe(true);
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
    preview = startPreview('cmi5', PORT);
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
    const initStmt = statements.find(
      (s) => s?.verb?.id === 'http://adlnet.gov/expapi/verbs/initialized',
    );
    expect(initStmt).toBeTruthy();
    expect(initStmt.actor?.account?.name).toBe('learner-1');
    expect(initStmt.object?.id).toBe('http://tessera.test/activity/course-1');
    expect(initStmt.context?.registration).toBe('test-registration-123');
  });

  test('passing a graded quiz sends a Passed statement', async ({ page }) => {
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

    await page
      .locator('.tessera-nav-page', { hasText: 'Graded Assessment' })
      .click();
    await page.waitForSelector('.tessera-quiz', { timeout: 10000 });

    // Answer all 3 questions correctly (same flow as the SCORM tests)
    await page
      .locator('.tessera-quiz-question-wrapper.active .tessera-mc-option')
      .nth(1)
      .click();
    const primary = page.locator('.tessera-quiz-nav .tessera-btn-primary');
    await primary.click();
    await page.waitForTimeout(300);
    await primary.click();
    await page.waitForTimeout(300);

    await page
      .locator('.tessera-quiz-question-wrapper.active input[type="text"]')
      .fill('blue');
    await primary.click();
    await page.waitForTimeout(300);
    await primary.click();
    await page.waitForTimeout(300);

    const active = page.locator('.tessera-quiz-question-wrapper.active');
    const left = active.locator('.tessera-matching-item.left');
    const right = active.locator('.tessera-matching-item.right');
    const n = await left.count();
    const targets: Record<string, string> = {
      '1': 'One',
      '2': 'Two',
      '3': 'Three',
    };
    for (let i = 0; i < n; i++) {
      const key = (await left.nth(i).textContent())?.trim() ?? '';
      const target = targets[key];
      if (!target) continue;
      await left.nth(i).click();
      await right.filter({ hasText: target }).first().click();
      await page.waitForTimeout(100);
    }
    await primary.click();
    await page.waitForTimeout(300);

    const submit = page.locator('.tessera-quiz-btn-submit');
    await submit.waitFor({ state: 'visible', timeout: 5000 });
    await submit.click();
    await page.waitForSelector('.tessera-quiz-results', { timeout: 5000 });

    // Wait for the Passed statement to land
    await expect
      .poll(
        () =>
          statements.find(
            (s) => s?.verb?.id === 'http://adlnet.gov/expapi/verbs/passed',
          ) != null,
        { timeout: 5000 },
      )
      .toBe(true);

    const passed = statements.find(
      (s) => s?.verb?.id === 'http://adlnet.gov/expapi/verbs/passed',
    );
    expect(passed.result?.success).toBe(true);
    expect(passed.result?.score?.scaled).toBe(1);

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
    preview = startPreview('xapi', PORT);
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

  test('launch sends Initialized with the 1.0.3 version header and verbatim Basic auth', async ({
    page,
  }) => {
    const statements: any[] = [];
    const headers: Array<Record<string, string>> = [];
    await routeLRS(page, statements, headers);

    await page.goto(xapiLaunchURL(BASE));
    await waitForTesseraContent(page);
    await page.waitForTimeout(500);

    const initStmt = statements.find(
      (s) => s?.verb?.id === 'http://adlnet.gov/expapi/verbs/initialized',
    );
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

  test('passing a graded quiz sends Passed + Answered, and pagehide sends Terminated', async ({
    page,
  }) => {
    const statements: any[] = [];
    const headers: Array<Record<string, string>> = [];
    await routeLRS(page, statements, headers);

    await page.goto(xapiLaunchURL(BASE));
    await waitForTesseraContent(page);

    await page
      .locator('.tessera-nav-page', { hasText: 'Graded Assessment' })
      .click();
    await page.waitForSelector('.tessera-quiz', { timeout: 10000 });

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
    await primary.click();
    await page.waitForTimeout(300);

    await page
      .locator('.tessera-quiz-question-wrapper.active input[type="text"]')
      .fill('blue');
    await primary.click();
    await page.waitForTimeout(300);
    await primary.click();
    await page.waitForTimeout(300);

    const active = page.locator('.tessera-quiz-question-wrapper.active');
    const left = active.locator('.tessera-matching-item.left');
    const right = active.locator('.tessera-matching-item.right');
    const n = await left.count();
    const targets: Record<string, string> = {
      '1': 'One',
      '2': 'Two',
      '3': 'Three',
    };
    for (let i = 0; i < n; i++) {
      const key = (await left.nth(i).textContent())?.trim() ?? '';
      const target = targets[key];
      if (!target) continue;
      await left.nth(i).click();
      await right.filter({ hasText: target }).first().click();
      await page.waitForTimeout(100);
    }
    await primary.click();
    await page.waitForTimeout(300);

    const submit = page.locator('.tessera-quiz-btn-submit');
    await submit.waitFor({ state: 'visible', timeout: 5000 });

    // Every answer was revealed, so every answer is already reported.
    await expect.poll(() => answeredSoFar().length, { timeout: 5000 }).toBe(3);

    await submit.click();
    await page.waitForSelector('.tessera-quiz-results', { timeout: 5000 });

    await expect
      .poll(
        () =>
          statements.find(
            (s) => s?.verb?.id === 'http://adlnet.gov/expapi/verbs/passed',
          ) != null,
        { timeout: 5000 },
      )
      .toBe(true);

    const passed = statements.find(
      (s) => s?.verb?.id === 'http://adlnet.gov/expapi/verbs/passed',
    );
    expect(passed.result?.success).toBe(true);
    expect(passed.result?.score?.scaled).toBe(1);
    // Plain xAPI carries the launch registration but none of cmi5's Defined-
    // Statement context (no cmi5/moveOn Category Activity).
    expect(passed.context?.registration).toBe('test-registration-xapi');
    expect(passed.context?.contextActivities?.category).toBeUndefined();

    const answered = answeredSoFar();
    expect(answered).toHaveLength(3);
    expect(answered.map((s) => s.object?.definition?.interactionType)).toEqual([
      'choice',
      'fill-in',
      'matching',
    ]);

    // Dispatch pagehide synchronously — the exit handler drains the queue and
    // fires Terminated as the final statement of the session.
    await page.evaluate(() => {
      window.dispatchEvent(
        new PageTransitionEvent('pagehide', { persisted: false }),
      );
    });
    await expect
      .poll(
        () =>
          statements.find(
            (s) => s?.verb?.id === 'http://adlnet.gov/expapi/verbs/terminated',
          ) != null,
        { timeout: 5000 },
      )
      .toBe(true);
  });
});
