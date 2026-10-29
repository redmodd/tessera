import { writeFile } from 'node:fs/promises';
import {
  screenReaderTest as test,
  type ScreenReaderPlaywright,
} from '@guidepup/playwright';
import { expect, type Locator, type Page } from '@playwright/test';

// Checked by hand in Safari: VoiceOver reads the result and the field's label,
// but WebKit capture drops speech around a text field.
const webkitTextFieldCapture =
  'WebKit capture drops VoiceOver speech around a text field';

async function hears(
  screenReader: ScreenReaderPlaywright,
  action: () => Promise<unknown>,
  ...phrases: string[]
): Promise<string> {
  // Capture ends after 1s without speech, and a loaded runner can take longer
  // to speak a focus move, so keep listening a second past the action.
  const { spokenPhrase } = await test.step(`hears ${phrases.join(' | ')}`, () =>
    screenReader.capture(
      async () => {
        await action();
        await new Promise((r) => setTimeout(r, 1000));
      },
      { capture: true },
    ),
  );
  // Chromium exposes CSS text-transform, so labels styled uppercase read in caps.
  const spoken = spokenPhrase.toLowerCase();
  for (const phrase of phrases) expect(spoken).toContain(phrase.toLowerCase());
  return spoken;
}

// NVDA's navigateToWebContent clicks the middle of <body>, so it runs on the
// intro page, where that click can't answer a question.
async function open(
  page: Page,
  screenReader: ScreenReaderPlaywright,
  title: string,
) {
  await page.goto('/');
  await expect(page.locator('.tessera-content h1')).toHaveText('Start');
  await test.step('navigateToWebContent', () => screenReader.navigateToWebContent());
  await page.locator('.tessera-nav-page', { hasText: title }).click();
  await expect(page.locator('.tessera-content h1')).toHaveText(title);
}

test.afterEach(async ({ screenReader }, testInfo) => {
  const log = await screenReader.spokenPhraseLog();
  await writeFile(testInfo.outputPath('spoken-phrases.txt'), log.join('\n'));
});

test.describe('standalone questions', () => {
  test.beforeEach(({ page, screenReader }) =>
    open(page, screenReader, 'Standalone Questions'),
  );

  async function submitAndRetry(
    screenReader: ScreenReaderPlaywright,
    question: Locator,
    result: string,
    firstControl: Locator,
    ...focusPhrases: string[]
  ) {
    await hears(
      screenReader,
      () => question.getByRole('button', { name: 'Submit' }).click(),
      result,
    );
    await hears(
      screenReader,
      () => question.getByRole('button', { name: 'Try again' }).click(),
      ...focusPhrases,
    );
    await expect(firstControl).toBeFocused();
  }

  test('MultipleChoice reads its result, and Try again returns focus', async ({
    page,
    screenReader,
  }) => {
    const mc = page.locator('.tessera-mc');
    await mc.getByText('Venus').click();
    await submitAndRetry(
      screenReader,
      mc,
      'Incorrect',
      mc.getByRole('radio', { name: 'Venus' }),
      'Venus',
      'radio button',
    );
  });

  test('FillInTheBlank reads its result, and Try again returns focus', async ({
    page,
    screenReader,
    browserName,
  }) => {
    test.fixme(browserName === 'webkit', webkitTextFieldCapture);
    const fitb = page.locator('.tessera-fitb');
    await fitb.getByRole('textbox').fill('water');
    await submitAndRetry(
      screenReader,
      fitb,
      'Incorrect',
      fitb.getByRole('textbox'),
      'What is the chemical symbol for water?',
      // NVDA says "edit", VoiceOver "edit text".
      'edit',
    );
  });

  test('Matching reads its result, and Try again returns focus', async ({
    page,
    screenReader,
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
      screenReader,
      matching,
      'Some pairs are incorrect',
      left('1'),
      'Activate, then choose a match',
    );
  });

  test('Sorting reads its result, and Try again returns focus', async ({
    page,
    screenReader,
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
      screenReader,
      sorting,
      'Some items are in the wrong category',
      card,
      'Activate, then choose a target',
    );
  });

  test('a selected Sorting card says to choose a target, and the targets are a list', async ({
    page,
    screenReader,
  }) => {
    const card = page.locator('.tessera-sorting-card');
    await hears(
      screenReader,
      () => card.focus(),
      (await card.textContent())!.trim(),
    );
    // Leave and return, so the reader announces the selected card afresh.
    // Captured, so VoiceOver's delayed hint can't land in the next check.
    await hears(screenReader, async () => {
      await card.press('Enter');
      await page.keyboard.press('Shift+Tab');
    });
    await expect(card).toHaveAttribute('aria-pressed', 'true');
    const spoken = await hears(
      screenReader,
      () => card.focus(),
      'choose a target',
    );
    expect(spoken).not.toContain('activate');

    await hears(
      screenReader,
      () => page.keyboard.press('Tab'),
      'list',
      'Fruit',
    );
    await expect(page.getByRole('button', { name: /^Fruit/ })).toBeFocused();
  });
});

test('an immediate-mode quiz announces each result', async ({
  page,
  screenReader,
  browserName,
}) => {
  await open(page, screenReader, 'Immediate Quiz');
  const active = page.locator('.tessera-quiz-question-wrapper.active');
  const primary = page.locator('.tessera-quiz-nav .tessera-btn-primary');

  await active.getByText('3', { exact: true }).click();
  await hears(screenReader, () => primary.click(), 'Incorrect');

  await hears(screenReader, () => primary.click(), 'Question 2 of 2');
  await test.step('the text field result', async (step) => {
    step.skip(browserName === 'webkit', webkitTextFieldCapture);
    await active.getByRole('textbox').fill('blue');
    const spoken = await hears(screenReader, () => primary.click(), 'Correct');
    expect(spoken).not.toContain('incorrect');
  });
});
