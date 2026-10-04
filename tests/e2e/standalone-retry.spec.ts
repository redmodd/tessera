import { expect, type Page } from '@playwright/test';
import { type ChildProcess } from 'node:child_process';
import {
  cmi5LaunchURL,
  installCmi5Mock,
  installScorm12Mock,
  installScorm2004Mock,
  test,
} from './lms-mocks.js';
import {
  findStatements,
  navigateToPage,
  scormData,
  startPreview,
  waitForServer,
  waitForTesseraContent,
} from './helpers.js';
import type { Standard } from './global-setup.js';

/** Each interaction recorded for q-retry, in order, as its correct flag. */
type Results = () => Promise<boolean[]>;

interface Mode {
  standard: Standard;
  port: number;
  launch(page: Page, base: string): Promise<Results>;
}

function scormMode(
  standard: 'scorm12' | 'scorm2004',
  port: number,
  install: (page: Page) => Promise<void>,
): Mode {
  return {
    standard,
    port,
    async launch(page, base) {
      await install(page);
      await page.goto(base);
      return async () => {
        const data = await scormData(page);
        return Object.keys(data)
          .filter(
            (k) =>
              /^cmi\.interactions\.\d+\.id$/.test(k) &&
              /^q[-_]retry$/.test(data[k]),
          )
          .map((k) => data[k.replace(/id$/, 'result')] === 'correct');
      };
    },
  };
}

const MODES: Mode[] = [
  scormMode('scorm12', 5314, installScorm12Mock),
  scormMode('scorm2004', 5315, installScorm2004Mock),
  {
    standard: 'cmi5',
    port: 5316,
    async launch(page, base) {
      const statements = await installCmi5Mock(page);
      await page.goto(cmi5LaunchURL(base));
      return async () =>
        findStatements(statements, 'answered')
          .filter((s) => s.object.id.endsWith('#q-retry'))
          .map((s) => s.result.success);
    },
  },
];

for (const mode of MODES) {
  test.describe.serial(`standalone retry trail: ${mode.standard}`, () => {
    const BASE = `http://localhost:${mode.port}`;
    let preview: ChildProcess;

    test.beforeAll(async ({ browser }) => {
      test.setTimeout(120_000);
      preview = startPreview('standalone-weight', mode.standard, mode.port);
      const page = await browser.newPage();
      try {
        await waitForServer(page, BASE);
      } finally {
        await page.close();
      }
    });

    test.afterAll(() => preview?.kill('SIGTERM'));
    test.afterEach(async ({ page }) => {
      const errors = await page.evaluate(
        () => (window as { __scormErrors?: unknown[] }).__scormErrors ?? [],
      );
      expect(errors).toEqual([]);
    });

    async function open(page: Page): Promise<Results> {
      const results = await mode.launch(page, BASE);
      await waitForTesseraContent(page);
      await navigateToPage(page, 'Practice Retry');
      return results;
    }

    const choose = (page: Page, option: string) =>
      page.locator('.tessera-mc-option', { hasText: option }).click();
    const tryAgain = (page: Page) =>
      page.getByRole('button', { name: 'Try again' });

    test('wrong then right reports two interactions and locks the correct one', async ({
      page,
    }) => {
      const results = await open(page);

      await choose(page, 'Venus');
      await expect.poll(results).toEqual([false]);
      await tryAgain(page).click();

      await choose(page, 'Mercury');
      await expect.poll(results).toEqual([false, true]);
      await expect(tryAgain(page)).toHaveCount(0);
      await expect(page.getByRole('radio', { name: 'Mercury' })).toBeDisabled();
    });

    test('maxRetries hides Try again once the retry is spent', async ({
      page,
    }) => {
      const results = await open(page);

      await choose(page, 'Venus');
      await expect.poll(results).toEqual([false]);
      await tryAgain(page).click();

      await choose(page, 'Earth');
      await expect.poll(results).toEqual([false, false]);
      await expect(tryAgain(page)).toHaveCount(0);
      await expect(page.getByRole('radio', { name: 'Earth' })).toBeDisabled();
    });
  });
}
