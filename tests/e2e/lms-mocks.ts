// In-browser LMS doubles for the e2e round-trips, backed by scorm-again, which
// validates every write — a spec-illegal write surfaces in window.__scormErrors
// and fails the round-trip. Injection is two init scripts: the browser bundle
// (defines window.Scorm12API / Scorm2004API), then a seam that builds the
// instance, installs window.API / API_1484_11, and exposes the seams the specs
// read: __scormDataSnapshot() (scorm-again's getFlattenedCMI(), already in the
// dotted-key shape), __scormLog, and __scormErrors. State is mirrored to
// sessionStorage and reloaded via loadFromFlattenedJSON so page.reload()
// restores the learner record (the LMS re-launch the resume specs exercise).
import { createRequire } from 'node:module';
import type { Page } from '@playwright/test';

const require = createRequire(import.meta.url);
// The require/default condition resolves to the UMD browser bundle
// (dist/scorm12.js — `this.Scorm12API = (...)`), injectable as a plain script.
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

/**
 * CMI5 mock. The adapter reads launch params from the URL
 * (?fetch=...&endpoint=...&registration=...&activityId=...&actor=...),
 * POSTs to the fetch URL to get an auth-token, then sends xAPI statements
 * to the endpoint. We expose the launch URL as a helper and intercept
 * network requests via page.route() in the spec. scorm-again does not
 * implement cmi5, so this path keeps its bespoke network mock.
 */
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
