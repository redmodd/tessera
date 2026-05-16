import { test, expect, type Page } from '@playwright/test';
import { exec, type ChildProcess } from 'node:child_process';
import { SCORM12_MOCK, SCORM2004_MOCK, cmi5LaunchURL } from './lms-mocks.js';
import { variantDir, viteBin, type Standard } from './global-setup.js';

/**
 * Phase 5 Task 2 Step 4 — load-bearing custom-quiz LMS roundtrip.
 *
 * Mirrors `lms-roundtrip.spec.ts` but builds the *custom-quiz* fixture
 * (`tests/fixtures/custom-quiz/`) against each of the four export standards
 * and asserts that a project-supplied `quiz.svelte` reports per-question
 * interactions and a final score to every adapter the same way the built-in
 * `<Quiz>` does. Without this, the data contract for custom shells has only
 * unit-level coverage.
 */

function startPreview(standard: Standard, port: number): ChildProcess {
  const dir = variantDir('custom-quiz', standard);
  return exec(
    `${viteBin('custom-quiz')} preview ${dir} --port ${port} --strictPort`,
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

async function waitForCustomQuiz(page: Page): Promise<void> {
  await page.waitForSelector('[data-testid="custom-quiz"]', { timeout: 15000 });
}

async function waitForScormCall(
  page: Page,
  predicate: (entry: string[]) => boolean,
  timeoutMs = 5000
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const matched = await page.evaluate(
      (pred: string) => {
        const log = (window as any).__scormLog || [];
        const fn = new Function('entry', `return (${pred})(entry)`);
        return log.some((entry: string[]) => fn(entry));
      },
      predicate.toString()
    );
    if (matched) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('Timed out waiting for SCORM call');
}

/**
 * The custom-quiz fixture stacks every question on a single page with one
 * Submit button — no per-question Next/Continue cycling like the built-in.
 * Answer both, click Submit, wait for the bridge to fire.
 */
async function answerCustomQuizCorrectly(page: Page): Promise<void> {
  await page.locator('.tessera-nav-page', { hasText: 'Exam' }).click();
  await waitForCustomQuiz(page);
  await page.locator('[data-question-id="q-planet"] .tessera-mc-option').nth(1).click();
  await page.locator('[data-question-id="q-water"] input[type="text"]').fill('H2O');
  await page.locator('[data-testid="custom-quiz-submit"]').click();
  await expect(page.locator('[data-testid="custom-quiz-status"]')).toContainText('state: submitted');
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
    await page.addInitScript(SCORM12_MOCK);
  });

  test('Custom quiz writes per-question cmi.interactions and final score', async ({ page }) => {
    await page.goto(BASE);
    // First page is intro; answerCustomQuizCorrectly navigates to the Exam
    // page and waits for the custom-quiz shell before answering.
    await answerCustomQuizCorrectly(page);

    await waitForScormCall(page, (e) => e[0] === 'LMSSetValue' && e[1] === 'cmi.core.score.raw');

    const data = await page.evaluate(() => (window as any).__scormDataSnapshot());
    expect(data['cmi.core.score.raw']).toBe('100');
    expect(data['cmi.core.lesson_status']).toBe('passed');

    const log = (await page.evaluate(() => (window as any).__scormLog)) as string[][];
    const typeWrites = log
      .filter((e) => e[0] === 'LMSSetValue' && /^cmi\.interactions\.\d+\.type$/.test(e[1]))
      .map((e) => e[2]);
    expect(typeWrites).toEqual(['choice', 'fill-in']);

    const idWrites = log
      .filter((e) => e[0] === 'LMSSetValue' && /^cmi\.interactions\.\d+\.id$/.test(e[1]))
      .map((e) => e[2]);
    expect(idWrites).toEqual(['q_planet', 'q_water']);
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
    await page.addInitScript(SCORM2004_MOCK);
  });

  test('Custom quiz writes per-question cmi.interactions and split status', async ({ page }) => {
    await page.goto(BASE);
    await answerCustomQuizCorrectly(page);

    await waitForScormCall(page, (e) => e[0] === 'SetValue' && e[1] === 'cmi.score.raw');

    const data = await page.evaluate(() => (window as any).__scormDataSnapshot());
    expect(data['cmi.score.raw']).toBe('100');
    expect(data['cmi.score.scaled']).toBe('1');
    expect(data['cmi.success_status']).toBe('passed');

    const log = (await page.evaluate(() => (window as any).__scormLog)) as string[][];
    const typeWrites = log
      .filter((e) => e[0] === 'SetValue' && /^cmi\.interactions\.\d+\.type$/.test(e[1]))
      .map((e) => e[2]);
    expect(typeWrites).toEqual(['choice', 'fill-in']);
    const idWrites = log
      .filter((e) => e[0] === 'SetValue' && /^cmi\.interactions\.\d+\.id$/.test(e[1]))
      .map((e) => e[2]);
    expect(idWrites).toEqual(['q_planet', 'q_water']);
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

  test('Custom quiz emits xAPI Passed and per-question Answered statements', async ({ page }) => {
    const statements: any[] = [];
    await page.route('http://cmi5-mock.test/**', async (route) => {
      const req = route.request();
      const url = req.url();
      if (url.endsWith('/fetch')) {
        await route.fulfill({
          status: 200,
          contentType: 'text/plain',
          body: 'auth-token=test-token-abc',
        });
        return;
      }
      if (url.includes('/xapi/statements')) {
        if (req.method() === 'POST' || req.method() === 'PUT') {
          try { statements.push(JSON.parse(req.postData() ?? '{}')); } catch {}
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
    await answerCustomQuizCorrectly(page);

    await expect
      .poll(
        () => statements.find((s) => s?.verb?.id === 'http://adlnet.gov/expapi/verbs/passed') != null,
        { timeout: 5000 }
      )
      .toBe(true);

    const passed = statements.find(
      (s) => s?.verb?.id === 'http://adlnet.gov/expapi/verbs/passed'
    );
    expect(passed.result?.success).toBe(true);
    expect(passed.result?.score?.scaled).toBe(1);

    const answered = statements.filter(
      (s) => s?.verb?.id === 'http://adlnet.gov/expapi/verbs/answered'
    );
    expect(answered).toHaveLength(2);
    expect(
      answered.map((s) => s.object?.definition?.interactionType)
    ).toEqual(['choice', 'fill-in']);
  });
});
