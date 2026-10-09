// E2E LMS doubles backed by scorm-again; spec-illegal writes surface in window.__scormErrors.
import { findPackageJSON } from 'node:module';
import { dirname, join } from 'node:path';
import { test as base, type Page } from '@playwright/test';

const scormAgainRoot = dirname(
  findPackageJSON('scorm-again', import.meta.url)!,
);
type LmsData = Record<string, string>;

export const test = base.extend<{ lmsData: LmsData }>({
  lmsData: [{}, { option: true }],
});

const SCORM_DIALECTS = {
  scorm12: {
    version: '12',
    global: 'API',
    prefix: 'LMS',
    end: 'Finish',
  },
  scorm2004: {
    version: '2004',
    global: 'API_1484_11',
    prefix: '',
    end: 'Terminate',
  },
} as const;

async function installScormMock(
  page: Page,
  standard: keyof typeof SCORM_DIALECTS,
  lmsData: LmsData,
): Promise<void> {
  const { version, global, prefix: p, end } = SCORM_DIALECTS[standard];
  await page.addInitScript({
    path: join(scormAgainRoot, 'dist', `${standard}.js`),
  });
  await page.addInitScript(`
(() => {
  const KEY = '__scorm${version}_data';
  const api = new window.Scorm${version}API(${JSON.stringify({ autocommit: false, lmsCommitUrl: false, logLevel: 'NONE' })});
  api.loadFromFlattenedJSON(${JSON.stringify(lmsData)});
  try {
    const raw = sessionStorage.getItem(KEY);
    if (raw) api.loadFromFlattenedJSON(JSON.parse(raw));
  } catch {}
  const persist = () => {
    try { sessionStorage.setItem(KEY, JSON.stringify(api.getFlattenedCMI())); } catch {}
  };
  window.__scormLog = [];
  window.__scormErrors = [];
  const capture = (key, ret) => {
    const code = api.${p}GetLastError();
    if (ret !== 'true' || code !== '0') window.__scormErrors.push({ key, code });
  };
  window.${global} = {
    ${p}Initialize(s) { const r = api.${p}Initialize(s); window.__scormLog.push(['${p}Initialize', s]); capture('Initialize', r); return r; },
    ${p}${end}(s) { const r = api.${p}${end}(s); window.__scormLog.push(['${p}${end}', s]); capture('${end}', r); persist(); return r; },
    ${p}GetValue(k) { const v = api.${p}GetValue(k); window.__scormLog.push(['${p}GetValue', k, v]); return v; },
    ${p}SetValue(k, v) { const r = api.${p}SetValue(k, String(v)); window.__scormLog.push(['${p}SetValue', k, String(v)]); capture(k, r); persist(); return r; },
    ${p}Commit(s) { const r = api.${p}Commit(s); window.__scormLog.push(['${p}Commit', s]); capture('Commit', r); persist(); return r; },
    ${p}GetLastError() { return api.${p}GetLastError(); },
    ${p}GetErrorString(c) { return api.${p}GetErrorString(c); },
    ${p}GetDiagnostic(c) { return api.${p}GetDiagnostic(c); },
  };
  window.__scormDataSnapshot = () => api.getFlattenedCMI();
})();
`);
}

/** Install a `scorm-again`-backed SCORM 1.2 LMS (`window.API`), seeded with LMS-owned values like `cmi.student_data.mastery_score`. */
export async function installScorm12Mock(
  page: Page,
  lmsData: LmsData = {},
): Promise<void> {
  await installScormMock(page, 'scorm12', lmsData);
}

/** Install a `scorm-again`-backed SCORM 2004 LMS (`window.API_1484_11`), seeded with LMS-owned values like `cmi.scaled_passing_score`. */
export async function installScorm2004Mock(
  page: Page,
  lmsData: LmsData = {},
): Promise<void> {
  await installScormMock(page, 'scorm2004', lmsData);
}

/**
 * Route the cmi5 launch endpoints to a mock LMS: the auth token, an LRS that
 * records every posted statement, and a State API with no saved state. Pass
 * `launchData` to serve an `LMS.LaunchData` document. Resolves to the array
 * the posted statements land in.
 */
export async function installCmi5Mock(
  page: Page,
  { launchData }: { launchData?: object } = {},
): Promise<any[]> {
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
        try {
          statements.push(...[JSON.parse(req.postData() ?? '[]')].flat());
        } catch {}
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(['stmt-id']),
      });
      return;
    }
    if (launchData && url.includes('stateId=LMS.LaunchData')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(launchData),
      });
      return;
    }
    if (url.includes('/xapi/activities/state')) {
      await route.fulfill({ status: 404, body: '{}' });
      return;
    }
    await route.fulfill({ status: 200, body: '{}' });
  });
  return statements;
}

export function cmi5LaunchURL(base: string): string {
  const params = new URLSearchParams({
    fetch: 'http://cmi5-mock.test/fetch',
    endpoint: 'http://cmi5-mock.test/xapi/',
    registration: 'test-registration-123',
    activityId: 'http://tessera.test/activity/course-1',
    actor: JSON.stringify({
      objectType: 'Agent',
      account: { name: 'learner-1', homePage: 'http://tessera.test' },
    }),
  });
  return `${base}/?${params.toString()}`;
}

/** Plain xAPI ("Tin Can") launch URL — snake_case `activity_id`, no fetch token. `auth` is the full "Basic <base64>" header value, per the Tin Can launch convention. */
export function xapiLaunchURL(base: string): string {
  const params = new URLSearchParams({
    endpoint: 'http://xapi-mock.test/xapi/',
    auth: 'Basic dGVzdDp0ZXN0',
    registration: 'test-registration-xapi',
    activity_id: 'http://tessera.test/activity/course-1',
    actor: JSON.stringify({
      objectType: 'Agent',
      account: { name: 'learner-1', homePage: 'http://tessera.test' },
    }),
  });
  return `${base}/?${params.toString()}`;
}
