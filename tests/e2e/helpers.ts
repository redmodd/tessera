// Shared page-driving helpers for the preview-server specs.
import { expect, type Page } from '@playwright/test';
import { execFile, type ChildProcess } from 'node:child_process';
import {
  variantDir,
  viteBin,
  type FixtureName,
  type Standard,
} from './global-setup.js';

export function startPreview(
  fixture: FixtureName,
  standard: Standard,
  port: number,
): ChildProcess {
  const dir = variantDir(fixture, standard);
  return execFile(
    viteBin(fixture),
    ['preview', dir, '--port', String(port), '--strictPort'],
    // vite preview loads the variant's vite.config.js, which reads
    // TESSERA_STANDARD. An invalid value exported in the developer's shell
    // fails validation and the server never binds.
    { cwd: dir, env: { ...process.env, TESSERA_STANDARD: '' } },
  );
}

export async function waitForServer(page: Page, url: string): Promise<void> {
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

export async function waitForTesseraContent(page: Page): Promise<void> {
  await page.waitForSelector('.tessera-content', { timeout: 15000 });
  await page
    .waitForFunction(
      () => !document.querySelector('.tessera-loading-skeleton'),
      { timeout: 5000 },
    )
    .catch(() => {});
}

/** Every call the SCORM mock has logged so far, as `[method, ...args]`. */
export async function scormLog(page: Page): Promise<string[][]> {
  return page.evaluate(() => (window as any).__scormLog);
}

/** The SCORM mock's current data model, keyed by `cmi.*` element. */
export async function scormData(page: Page): Promise<Record<string, string>> {
  return page.evaluate(() => (window as any).__scormDataSnapshot());
}

/**
 * Every cmi.interactions.* write the SCORM mock has logged so far. Matches
 * both mocks: SCORM 1.2 logs LMSSetValue, SCORM 2004 logs SetValue.
 */
export async function interactionWrites(page: Page): Promise<string[][]> {
  return (await scormLog(page)).filter(
    (e) => /^(LMS)?SetValue$/.test(e[0]) && /^cmi\.interactions\./.test(e[1]),
  );
}

/** Values written to cmi.interactions.<n>.<field>, in write order. */
export async function interactionField(
  page: Page,
  field: string,
): Promise<string[]> {
  const re = new RegExp(String.raw`^cmi\.interactions\.\d+\.${field}$`);
  const writes = await interactionWrites(page);
  return writes.filter((e) => re.test(e[1])).map((e) => e[2]);
}

/** How many distinct questions have reported an interaction. */
export async function reportedQuestionCount(page: Page): Promise<number> {
  const writes = await interactionWrites(page);
  return new Set(writes.map((e) => e[1].split('.')[2])).size;
}

/**
 * Click each left item and select its mapped right item by visible text.
 * Waits for the matched count to advance after each pair so we don't race the
 * Svelte effect that records the pairing.
 */
export async function answerMatching(
  page: Page,
  matchMap: Record<string, string>,
): Promise<void> {
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
 * Fire the course's exit handler as a closing tab would. The SCORM mock holds
 * the final writes on return; xAPI statements send asynchronously, so poll.
 */
export async function exitCourse(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.dispatchEvent(
      new PageTransitionEvent('pagehide', { persisted: false }),
    );
  });
}

/** Open a quiz page from the sidebar by its title. */
export async function openQuiz(page: Page, title: string): Promise<void> {
  await page.locator('.tessera-nav-page', { hasText: title }).click();
  await expect(page.locator('.tessera-quiz')).toBeVisible({ timeout: 10000 });
}

/**
 * Answer the `free` fixture's three-question graded quiz and submit, returning
 * once the results panel is visible. Every answer is correct unless
 * `q1Correct` is false. Asserts on button text rather than sleeping, so it
 * stays in step with the quiz's feedback transitions.
 */
export async function answerGradedQuiz(
  page: Page,
  { q1Correct = true } = {},
): Promise<void> {
  const primary = page.locator('.tessera-quiz-nav .tessera-btn-primary');

  await page
    .locator('.tessera-quiz-question-wrapper.active .tessera-mc-option')
    .nth(q1Correct ? 1 : 0)
    .click();
  await expect(primary).toHaveText('Submit');
  await primary.click();
  await expect(primary).toHaveText('Next Question');
  await primary.click();

  await answerGradedQuizAfterQ1(page);
  await page.locator('.tessera-quiz-btn-submit').click();
  await expect(page.locator('.tessera-quiz-results')).toBeVisible();
}

/** Answer Q2 and Q3 of the `free` graded quiz correctly, stopping once the final Submit is visible. */
export async function answerGradedQuizAfterQ1(page: Page): Promise<void> {
  const primary = page.locator('.tessera-quiz-nav .tessera-btn-primary');

  await page
    .locator('.tessera-quiz-question-wrapper.active input[type="text"]')
    .fill('blue');
  await expect(primary).toHaveText('Submit');
  await primary.click();
  await expect(primary).toHaveText('Next Question');
  await primary.click();

  await answerMatching(page, { '1': 'One', '2': 'Two', '3': 'Three' });
  await expect(primary).toHaveText('Submit');
  await primary.click();

  await expect(page.locator('.tessera-quiz-btn-submit')).toBeVisible();
}

export const primaryBtn = (page: Page) =>
  page.locator('.tessera-quiz-nav .tessera-btn-primary');

export async function answerMultipleChoice(
  page: Page,
  optionIndex: number,
): Promise<void> {
  const radios = page.locator(
    '.tessera-quiz-question-wrapper.active .tessera-mc-option',
  );
  await radios.nth(optionIndex).click();
}

export async function answerFillInTheBlank(
  page: Page,
  text: string,
): Promise<void> {
  const input = page.locator(
    '.tessera-quiz-question-wrapper.active input[type="text"]',
  );
  await input.fill(text);
}

export async function completePracticeQuiz(
  page: Page,
  { mc, fill }: { mc: number; fill: string },
): Promise<void> {
  const progress = page.locator('.tessera-quiz-progress-desktop').first();

  await expect(progress).toContainText('Question 1 of 2');
  await answerMultipleChoice(page, mc);
  await primaryBtn(page).click();

  await expect(progress).toContainText('Question 2 of 2');
  await answerFillInTheBlank(page, fill);

  await page.locator('.tessera-quiz-btn-submit').click();
  await expect(page.locator('.tessera-quiz-results')).toBeVisible();
}

export async function finishFreeCourse(page: Page): Promise<void> {
  await openQuiz(page, 'Practice Quiz');
  await completePracticeQuiz(page, { mc: 1, fill: 'H2O' });

  const nav = page.locator('.tessera-nav-page');
  const count = await nav.count();
  for (let i = 0; i < count; i++) {
    await nav.nth(i).click();
    await waitForTesseraContent(page);
  }
}

export function findStatement(statements: any[], verb: string): any {
  return statements.find(
    (s) => s?.verb?.id === `http://adlnet.gov/expapi/verbs/${verb}`,
  );
}
