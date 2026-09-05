// Shared page-driving helpers for the preview-server specs.
import { expect, type Page } from '@playwright/test';

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

/** Every cmi.interactions.* write the SCORM mock has logged so far. */
export async function interactionWrites(page: Page): Promise<string[][]> {
  const log = (await page.evaluate(
    () => (window as any).__scormLog,
  )) as string[][];
  return log.filter(
    (e) => e[0] === 'LMSSetValue' && /^cmi\.interactions\./.test(e[1]),
  );
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
