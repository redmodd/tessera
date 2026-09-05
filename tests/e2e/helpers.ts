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

/**
 * Every cmi.interactions.* write the SCORM mock has logged so far. Matches
 * both mocks: SCORM 1.2 logs LMSSetValue, SCORM 2004 logs SetValue.
 */
export async function interactionWrites(page: Page): Promise<string[][]> {
  const log = (await page.evaluate(
    () => (window as any).__scormLog,
  )) as string[][];
  return log.filter(
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
