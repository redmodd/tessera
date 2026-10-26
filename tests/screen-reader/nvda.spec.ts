import { writeFile } from 'node:fs/promises';
import { nvdaTest as test, type NVDAPlaywright } from '@guidepup/playwright';
import { expect, type Locator, type Page } from '@playwright/test';
import { navigateToPage, primaryBtn } from '../e2e/helpers.js';

async function hears(
  nvda: NVDAPlaywright,
  action: () => Promise<unknown>,
  ...phrases: string[]
): Promise<void> {
  const { spokenPhrase } = await nvda.capture(action, { capture: true });
  // Chromium exposes CSS text-transform, so NVDA reads uppercase labels in caps.
  for (const phrase of phrases)
    expect(spokenPhrase.toLowerCase()).toContain(phrase.toLowerCase());
}

// navigateToWebContent clicks the middle of <body>, so it runs on the intro
// page, where that click can't answer a question.
async function open(page: Page, nvda: NVDAPlaywright, title: string) {
  await page.goto('/');
  await expect(page.locator('.tessera-content h1')).toHaveText('Start');
  await nvda.navigateToWebContent();
  await navigateToPage(page, title);
}

test.afterEach(async ({ nvda }, testInfo) => {
  const log = await nvda.spokenPhraseLog();
  await writeFile(testInfo.outputPath('nvda-phrases.txt'), log.join('\n'));
});

test.describe('standalone questions', () => {
  test.beforeEach(({ page, nvda }) => open(page, nvda, 'Standalone Questions'));

  async function submitAndRetry(
    nvda: NVDAPlaywright,
    question: Locator,
    result: string,
    firstControl: Locator,
    ...focusPhrases: string[]
  ) {
    await hears(
      nvda,
      () => question.getByRole('button', { name: 'Submit' }).click(),
      result,
    );
    await hears(
      nvda,
      () => question.getByRole('button', { name: 'Try again' }).click(),
      ...focusPhrases,
    );
    await expect(firstControl).toBeFocused();
  }

  test('MultipleChoice reads its result, and Try again returns focus', async ({
    page,
    nvda,
  }) => {
    const mc = page.locator('.tessera-mc');
    await mc.getByText('Venus').click();
    await submitAndRetry(
      nvda,
      mc,
      'Incorrect',
      mc.getByRole('radio', { name: 'Venus' }),
      'Venus',
      'radio button',
    );
  });

  test('FillInTheBlank reads its result, and Try again returns focus', async ({
    page,
    nvda,
  }) => {
    const fitb = page.locator('.tessera-fitb');
    await fitb.getByRole('textbox').fill('water');
    await submitAndRetry(
      nvda,
      fitb,
      'Incorrect',
      fitb.getByRole('textbox'),
      'What is the chemical symbol for water?',
      'edit',
    );
  });

  test('Matching reads its result, and Try again returns focus', async ({
    page,
    nvda,
  }) => {
    const matching = page.locator('.tessera-matching');
    const left = (text: string) =>
      matching.locator('.tessera-matching-item.left', { hasText: text });
    const right = (text: string) =>
      matching.locator('.tessera-matching-item.right', { hasText: text });
    await left('1').click();
    await right('Two').click();
    await left('2').click();
    await right('One').click();
    await submitAndRetry(
      nvda,
      matching,
      'Some pairs are incorrect',
      left('1'),
      'Activate, then choose a match',
    );
  });

  test('Sorting reads its result, and Try again returns focus', async ({
    page,
    nvda,
  }) => {
    const sorting = page.locator('.tessera-sorting');
    const card = sorting.locator('.tessera-sorting-card');
    const wrongTarget: Record<string, string> = {
      Apple: 'Vegetable',
      Carrot: 'Fruit',
    };
    for (let i = 0; i < 2; i++) {
      const target = wrongTarget[(await card.textContent())!.trim()];
      await card.click();
      await sorting
        .getByRole('button', { name: new RegExp(`^${target}`) })
        .click();
    }
    await submitAndRetry(
      nvda,
      sorting,
      'Some items are in the wrong category',
      card,
      'Activate, then choose a target',
    );
  });

  test('a selected Sorting card says to choose a target, and the targets are a list', async ({
    page,
    nvda,
  }) => {
    const card = page.locator('.tessera-sorting-card');
    await hears(nvda, () => card.focus(), (await card.textContent())!.trim());
    await card.press('Enter');
    await expect(card).toHaveAttribute('aria-pressed', 'true');

    await nvda.perform(nvda.keyboardCommands.reportCurrentFocus, {
      capture: true,
    });
    expect(await nvda.lastSpokenPhrase()).toContain('Choose a target');

    await hears(nvda, () => page.keyboard.press('Tab'), 'list', 'Fruit');
    await expect(page.getByRole('button', { name: /^Fruit/ })).toBeFocused();
  });
});

test('an immediate-mode quiz announces each result', async ({ page, nvda }) => {
  await open(page, nvda, 'Immediate Quiz');
  const active = page.locator('.tessera-quiz-question-wrapper.active');
  const primary = primaryBtn(page);

  await active.getByText('3', { exact: true }).click();
  await hears(nvda, () => primary.click(), 'Incorrect');

  await hears(nvda, () => primary.click(), 'Question 2 of 2');
  await active.getByRole('textbox').fill('blue');
  await hears(nvda, () => primary.click(), 'Correct');
});
