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

interface Launch {
  results: Results;
  /** What the LMS holds for q-retry in the saved state, once it has been written. */
  saved(): Promise<unknown>;
}

interface Mode {
  standard: Standard;
  port: number;
  launch(page: Page, base: string): Promise<Launch>;
}

const savedRetry = (state: any) => state?.g?.['1']?.q?.['q-retry'];

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
      return {
        async results() {
          const data = await scormData(page);
          return Object.keys(data)
            .filter(
              (k) =>
                /^cmi\.interactions\.\d+\.id$/.test(k) &&
                /^q[-_]retry$/.test(data[k]),
            )
            .map((k) => data[k.replace(/id$/, 'result')] === 'correct');
        },
        async saved() {
          const raw = (await scormData(page))['cmi.suspend_data'];
          return savedRetry(raw ? JSON.parse(raw) : null);
        },
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
      const documents = new Map<string, string>();
      const statements = await installCmi5Mock(page, { documents });
      await page.goto(cmi5LaunchURL(base));
      return {
        results: async () =>
          findStatements(statements, 'answered')
            .filter((s) => s.object.id.endsWith('#q-retry'))
            .map((s) => s.result.success),
        saved: async () =>
          savedRetry(JSON.parse(documents.get('tessera-state') ?? 'null')),
      };
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

    async function open(page: Page): Promise<Launch> {
      const launch = await mode.launch(page, BASE);
      await waitForTesseraContent(page);
      await navigateToPage(page, 'Practice Retry');
      return launch;
    }

    async function choose(page: Page, option: string) {
      await page.locator('.tessera-mc-option', { hasText: option }).click();
      await page.getByRole('button', { name: 'Check', exact: true }).click();
    }
    const tryAgain = (page: Page) =>
      page.getByRole('button', { name: 'Try again' });

    async function expectLocked(page: Page, option: string) {
      const radio = page.getByRole('radio', { name: option });
      await expect(radio).toBeChecked();
      await expect(radio).toBeDisabled();
      await expect(tryAgain(page)).toHaveCount(0);
    }

    async function leaveAndReturn(page: Page) {
      await navigateToPage(page, 'Weighted Questions');
      await navigateToPage(page, 'Practice Retry');
    }

    async function relaunch(page: Page) {
      await page.reload();
      await expect(page.locator('.tessera-content h1')).toContainText(
        'Practice Retry',
      );
    }

    test('wrong then right reports two interactions and locks the correct one', async ({
      page,
    }) => {
      const { results } = await open(page);

      await choose(page, 'Venus');
      await expect.poll(results).toEqual([false]);
      await tryAgain(page).click();
      await expect(page.getByRole('radio').first()).toBeFocused();

      await choose(page, 'Mercury');
      await expect.poll(results).toEqual([false, true]);
      await expect(tryAgain(page)).toHaveCount(0);
      await expect(page.getByRole('radio', { name: 'Mercury' })).toBeDisabled();
    });

    test('maxRetries hides Try again once the retry is spent', async ({
      page,
    }) => {
      const { results } = await open(page);

      await choose(page, 'Venus');
      await expect.poll(results).toEqual([false]);
      await tryAgain(page).click();

      await choose(page, 'Earth');
      await expect.poll(results).toEqual([false, false]);
      await expect(tryAgain(page)).toHaveCount(0);
      await expect(page.getByRole('radio', { name: 'Earth' })).toBeDisabled();
    });

    test('a correct answer stays locked when the learner returns to the page or relaunches', async ({
      page,
    }) => {
      const { results, saved } = await open(page);
      await choose(page, 'Mercury');
      await expect.poll(results).toEqual([true]);

      await leaveAndReturn(page);
      await expectLocked(page, 'Mercury');

      await expect.poll(saved).toEqual([100, 1, 0, 0, [1]]);
      await relaunch(page);
      await expectLocked(page, 'Mercury');
      await expect.poll(results).toEqual([true]);
    });

    test('a spent retry stays spent when the learner returns to the page or relaunches', async ({
      page,
    }) => {
      const { results, saved } = await open(page);
      await choose(page, 'Venus');
      await tryAgain(page).click();
      await choose(page, 'Earth');
      await expect.poll(results).toEqual([false, false]);

      await leaveAndReturn(page);
      await expectLocked(page, 'Earth');

      await expect.poll(saved).toEqual([0, 1, 0, 1, [2]]);
      await relaunch(page);
      await expectLocked(page, 'Earth');
      await expect.poll(results).toEqual([false, false]);
    });
  });
}
