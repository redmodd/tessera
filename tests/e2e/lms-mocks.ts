/**
 * In-browser mocks for LMS APIs. Injected via page.addInitScript() so they run
 * before the course bundle boots. Data is mirrored into sessionStorage so it
 * survives a page.reload() — this simulates an LMS re-launching the same SCO
 * and restoring saved state.
 */

export const SCORM12_MOCK = `
(() => {
  const STORAGE_KEY = '__scorm12_mock_data';
  let data = {};
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw) data = JSON.parse(raw);
  } catch {}
  const persist = () => {
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch {}
  };
  window.__scormLog = [];
  window.API = {
    LMSInitialize(s) { window.__scormLog.push(['LMSInitialize', s]); return 'true'; },
    LMSFinish(s) { window.__scormLog.push(['LMSFinish', s]); persist(); return 'true'; },
    LMSGetValue(k) {
      const v = data[k] != null ? String(data[k]) : '';
      window.__scormLog.push(['LMSGetValue', k, v]);
      return v;
    },
    LMSSetValue(k, v) {
      data[k] = String(v);
      persist();
      window.__scormLog.push(['LMSSetValue', k, String(v)]);
      return 'true';
    },
    LMSCommit(s) { persist(); window.__scormLog.push(['LMSCommit', s]); return 'true'; },
    LMSGetLastError() { return '0'; },
    LMSGetErrorString() { return ''; },
    LMSGetDiagnostic() { return ''; },
  };
  window.__scormDataSnapshot = () => JSON.parse(JSON.stringify(data));
})();
`;

export const SCORM2004_MOCK = `
(() => {
  const STORAGE_KEY = '__scorm2004_mock_data';
  let data = {};
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw) data = JSON.parse(raw);
  } catch {}
  const persist = () => {
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch {}
  };
  window.__scormLog = [];
  window.API_1484_11 = {
    Initialize(s) { window.__scormLog.push(['Initialize', s]); return 'true'; },
    Terminate(s) { window.__scormLog.push(['Terminate', s]); persist(); return 'true'; },
    GetValue(k) {
      const v = data[k] != null ? String(data[k]) : '';
      window.__scormLog.push(['GetValue', k, v]);
      return v;
    },
    SetValue(k, v) {
      data[k] = String(v);
      persist();
      window.__scormLog.push(['SetValue', k, String(v)]);
      return 'true';
    },
    Commit(s) { persist(); window.__scormLog.push(['Commit', s]); return 'true'; },
    GetLastError() { return '0'; },
    GetErrorString() { return ''; },
    GetDiagnostic() { return ''; },
  };
  window.__scormDataSnapshot = () => JSON.parse(JSON.stringify(data));
})();
`;

/**
 * CMI5 mock. The adapter reads launch params from the URL
 * (?fetch=...&endpoint=...&registration=...&activityId=...&actor=...),
 * POSTs to the fetch URL to get an auth-token, then sends xAPI statements
 * to the endpoint. We expose the launch URL as a helper and intercept
 * network requests via page.route() in the spec.
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
