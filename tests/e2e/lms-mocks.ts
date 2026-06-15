// E2E LMS doubles backed by scorm-again; spec-illegal writes surface in window.__scormErrors.
import { createRequire } from 'node:module';
import type { Page } from '@playwright/test';

const require = createRequire(import.meta.url);
const SCORM12_BUNDLE = require.resolve('scorm-again/scorm12');
const SCORM2004_BUNDLE = require.resolve('scorm-again/scorm2004');

const SCORM12_SEAM = `
(() => {
  const KEY = '__scorm12_data';
  const api = new window.Scorm12API({ autocommit: false, lmsCommitUrl: false, logLevel: 'NONE' });
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
    const code = api.LMSGetLastError();
    if (ret !== 'true' || code !== '0') window.__scormErrors.push({ key, code });
  };
  window.API = {
    LMSInitialize(s) { const r = api.LMSInitialize(s); window.__scormLog.push(['LMSInitialize', s]); capture('Initialize', r); return r; },
    LMSFinish(s) { const r = api.LMSFinish(s); window.__scormLog.push(['LMSFinish', s]); capture('Finish', r); persist(); return r; },
    LMSGetValue(k) { const v = api.LMSGetValue(k); window.__scormLog.push(['LMSGetValue', k, v]); return v; },
    LMSSetValue(k, v) { const r = api.LMSSetValue(k, String(v)); window.__scormLog.push(['LMSSetValue', k, String(v)]); capture(k, r); persist(); return r; },
    LMSCommit(s) { const r = api.LMSCommit(s); window.__scormLog.push(['LMSCommit', s]); capture('Commit', r); persist(); return r; },
    LMSGetLastError() { return api.LMSGetLastError(); },
    LMSGetErrorString(c) { return api.LMSGetErrorString(c); },
    LMSGetDiagnostic(c) { return api.LMSGetDiagnostic(c); },
  };
  window.__scormDataSnapshot = () => api.getFlattenedCMI();
})();
`;

const SCORM2004_SEAM = `
(() => {
  const KEY = '__scorm2004_data';
  const api = new window.Scorm2004API({ autocommit: false, lmsCommitUrl: false, logLevel: 'NONE' });
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
    const code = api.GetLastError();
    if (ret !== 'true' || code !== '0') window.__scormErrors.push({ key, code });
  };
  window.API_1484_11 = {
    Initialize(s) { const r = api.Initialize(s); window.__scormLog.push(['Initialize', s]); capture('Initialize', r); return r; },
    Terminate(s) { const r = api.Terminate(s); window.__scormLog.push(['Terminate', s]); capture('Terminate', r); persist(); return r; },
    GetValue(k) { const v = api.GetValue(k); window.__scormLog.push(['GetValue', k, v]); return v; },
    SetValue(k, v) { const r = api.SetValue(k, String(v)); window.__scormLog.push(['SetValue', k, String(v)]); capture(k, r); persist(); return r; },
    Commit(s) { const r = api.Commit(s); window.__scormLog.push(['Commit', s]); capture('Commit', r); persist(); return r; },
    GetLastError() { return api.GetLastError(); },
    GetErrorString(c) { return api.GetErrorString(c); },
    GetDiagnostic(c) { return api.GetDiagnostic(c); },
  };
  window.__scormDataSnapshot = () => api.getFlattenedCMI();
})();
`;

/** Install a `scorm-again`-backed SCORM 1.2 LMS (`window.API`). */
export async function installScorm12Mock(page: Page): Promise<void> {
  await page.addInitScript({ path: SCORM12_BUNDLE });
  await page.addInitScript(SCORM12_SEAM);
}

/** Install a `scorm-again`-backed SCORM 2004 LMS (`window.API_1484_11`). */
export async function installScorm2004Mock(page: Page): Promise<void> {
  await page.addInitScript({ path: SCORM2004_BUNDLE });
  await page.addInitScript(SCORM2004_SEAM);
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
