// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CMI5Adapter } from '../src/runtime/adapters/cmi5.js';
import { hasCMI5LaunchParams } from '../src/runtime/adapters/discovery.js';
import type { SavedState } from '../src/runtime/persistence.js';
import { RETRY_ATTEMPTS } from '../src/runtime/adapters/retry.js';

const mockFetch = vi.fn();

function setSearchParams(params: Record<string, string>) {
  const searchString = new URLSearchParams(params).toString();
  const url = `http://localhost/?${searchString}`;
  Object.defineProperty(window, 'location', {
    value: new URL(url),
    writable: true,
    configurable: true,
  });
}

const baseLaunchParams = {
  fetch: 'https://lms.example.com/fetch-token',
  endpoint: 'https://lms.example.com/xapi/',
  registration: 'reg-123',
  activityId: 'https://example.com/course/1',
  actor: JSON.stringify({ mbox: 'mailto:test@example.com', name: 'Test User' }),
};

describe('hasCMI5LaunchParams', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns true when all params present', () => {
    setSearchParams(baseLaunchParams);
    expect(hasCMI5LaunchParams()).toBe(true);
  });

  it('returns false when fetch is missing', () => {
    const { fetch: _, ...rest } = baseLaunchParams;
    setSearchParams(rest);
    expect(hasCMI5LaunchParams()).toBe(false);
  });

  it('returns false when endpoint is missing', () => {
    const { endpoint: _, ...rest } = baseLaunchParams;
    setSearchParams(rest);
    expect(hasCMI5LaunchParams()).toBe(false);
  });

  it('returns false when activityId is missing', () => {
    const { activityId: _, ...rest } = baseLaunchParams;
    setSearchParams(rest);
    expect(hasCMI5LaunchParams()).toBe(false);
  });

  it('returns false when actor is missing', () => {
    const { actor: _, ...rest } = baseLaunchParams;
    setSearchParams(rest);
    expect(hasCMI5LaunchParams()).toBe(false);
  });

  it('returns false with empty search', () => {
    vi.stubGlobal('location', { ...window.location, search: '' });
    expect(hasCMI5LaunchParams()).toBe(false);
  });
});

describe('CMI5Adapter', () => {
  let adapter: CMI5Adapter;

  beforeEach(() => {
    mockFetch.mockReset();
    vi.spyOn(globalThis, 'fetch').mockImplementation(mockFetch);
    setSearchParams(baseLaunchParams);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function setupInitMocks(
    savedState?: SavedState,
    launchData?: Record<string, unknown> | null,
  ) {
    mockFetch.mockImplementation(async (url: string, options?: RequestInit) => {
      // Token fetch
      if (url === baseLaunchParams.fetch) {
        return { ok: true, text: async () => 'test-auth-token' };
      }
      // State API GET
      if (
        url.includes('activities/state') &&
        (!options || options.method === 'GET')
      ) {
        if (url.includes('stateId=LMS.LaunchData')) {
          if (launchData) return { ok: true, json: async () => launchData };
          return { ok: false, status: 404 };
        }
        if (savedState)
          return { ok: true, text: async () => JSON.stringify(savedState) };
        return { ok: false, status: 404 };
      }
      // Agent Profile GET (Learner Preferences)
      if (url.includes('agents/profile')) {
        return { ok: false, status: 404 };
      }
      // Statements POST (Initialized, Answered, etc.)
      if (url.includes('statements')) {
        return { ok: true };
      }
      return { ok: false, status: 404 };
    });
  }

  it('fetches auth token on init', async () => {
    setupInitMocks();
    adapter = new CMI5Adapter();
    await adapter.init();
    expect(mockFetch).toHaveBeenCalledWith(
      baseLaunchParams.fetch,
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('sends Initialized statement on init', async () => {
    setupInitMocks();
    adapter = new CMI5Adapter();
    await adapter.init();

    const statementCalls = mockFetch.mock.calls.filter(
      (c: any[]) => c[0].includes('statements') && c[1]?.method === 'POST',
    );
    expect(statementCalls.length).toBeGreaterThanOrEqual(1);
    const body = JSON.parse(statementCalls[0][1].body);
    expect(body.verb.id).toBe('http://adlnet.gov/expapi/verbs/initialized');
  });

  it('does not fetch resume state during init', async () => {
    setupInitMocks({ b: 3, v: [0, 1, 2, 3], q: {}, d: 100 });
    adapter = new CMI5Adapter();
    await adapter.init();
    const resumeGets = mockFetch.mock.calls.filter(
      ([url, options]: any[]) =>
        String(url).includes('activities/state') &&
        !String(url).includes('stateId=LMS.LaunchData') &&
        (!options || options.method === 'GET'),
    );
    expect(resumeGets).toHaveLength(0);
    expect(adapter.getState()).toBeNull();

    await adapter.loadState();
    expect(adapter.getState()).toEqual({
      b: 3,
      v: [0, 1, 2, 3],
      q: {},
      d: 100,
    });
  });

  it('retries a transient resume GET failure and restores on success', async () => {
    const saved: SavedState = { b: 2, v: [0, 1, 2], q: {}, d: 5 };
    setupInitMocks();
    adapter = new CMI5Adapter();
    await adapter.init();

    let resumeGets = 0;
    mockFetch.mockImplementation(async (url: string, options?: RequestInit) => {
      if (
        url.includes('activities/state') &&
        (!options || options.method === 'GET')
      ) {
        resumeGets++;
        if (resumeGets === 1) throw new Error('transient');
        if (resumeGets === 2) return { ok: false, status: 503 };
        return { ok: true, text: async () => JSON.stringify(saved) };
      }
      return { ok: true, text: async () => '', json: async () => ({}) };
    });
    await adapter.loadState();

    expect(resumeGets).toBe(3);
    expect(adapter.getState()).toEqual(saved);

    mockFetch.mockClear();
    adapter.saveState({ b: 3, v: [0, 1, 2, 3], q: {}, d: 9 });
    await new Promise((r) => setTimeout(r, 0));
    expect(
      mockFetch.mock.calls.filter(
        ([url, options]: any[]) =>
          String(url).includes('activities/state') && options?.method === 'PUT',
      ),
    ).toHaveLength(1);
  });

  it('does not retry a 404, which is a definitive empty answer', async () => {
    setupInitMocks();
    adapter = new CMI5Adapter();
    await adapter.init();

    let resumeGets = 0;
    mockFetch.mockImplementation(async (url: string, options?: RequestInit) => {
      if (
        url.includes('activities/state') &&
        (!options || options.method === 'GET')
      ) {
        resumeGets++;
        return { ok: false, status: 404 };
      }
      return { ok: true, text: async () => '', json: async () => ({}) };
    });
    await adapter.loadState();
    expect(resumeGets).toBe(1);
  });

  it('treats an empty 2xx body as no state, leaving saving enabled', async () => {
    setupInitMocks();
    adapter = new CMI5Adapter();
    await adapter.init();

    let resumeGets = 0;
    mockFetch.mockImplementation(async (url: string, options?: RequestInit) => {
      if (
        url.includes('activities/state') &&
        (!options || options.method === 'GET')
      ) {
        resumeGets++;
        return { ok: true, status: 204, text: async () => '' };
      }
      return { ok: true, text: async () => '', json: async () => ({}) };
    });
    await adapter.loadState();

    expect(resumeGets).toBe(1);
    expect(adapter.getState()).toBeNull();

    mockFetch.mockClear();
    adapter.saveState({ b: 1, v: [0, 1], q: {}, d: 4 });
    await new Promise((r) => setTimeout(r, 0));
    expect(
      mockFetch.mock.calls.filter(
        ([url, options]: any[]) =>
          String(url).includes('activities/state') && options?.method === 'PUT',
      ),
    ).toHaveLength(1);
  });

  it('refuses to save after a failed resume GET, so it cannot clobber', async () => {
    setupInitMocks();
    adapter = new CMI5Adapter();
    await adapter.init();
    let resumeGets = 0;
    mockFetch.mockImplementation(async (url: string, options?: RequestInit) => {
      if (
        url.includes('activities/state') &&
        (!options || options.method === 'GET')
      ) {
        resumeGets++;
        throw new Error('network down');
      }
      return { ok: true, text: async () => '', json: async () => ({}) };
    });
    await adapter.loadState();
    expect(adapter.getState()).toBeNull();
    expect(resumeGets).toBe(RETRY_ATTEMPTS);

    mockFetch.mockClear();
    adapter.saveState({ b: 0, v: [0], q: {}, d: 1 });
    await new Promise((r) => setTimeout(r, 0));
    const puts = mockFetch.mock.calls.filter(
      ([url, options]: any[]) =>
        String(url).includes('activities/state') && options?.method === 'PUT',
    );
    expect(puts).toHaveLength(0);
  });

  it('still saves when the resume GET legitimately 404s', async () => {
    setupInitMocks();
    adapter = new CMI5Adapter();
    await adapter.init();
    await adapter.loadState();
    expect(adapter.getState()).toBeNull();

    mockFetch.mockClear();
    adapter.saveState({ b: 0, v: [0], q: {}, d: 1 });
    await new Promise((r) => setTimeout(r, 0));
    const puts = mockFetch.mock.calls.filter(
      ([url, options]: any[]) =>
        String(url).includes('activities/state') && options?.method === 'PUT',
    );
    expect(puts).toHaveLength(1);
  });

  it('overwrites an unparseable saved document instead of locking saves out', async () => {
    setupInitMocks();
    adapter = new CMI5Adapter();
    await adapter.init();
    let resumeGets = 0;
    mockFetch.mockImplementation(async (url: string, options?: RequestInit) => {
      if (
        url.includes('activities/state') &&
        (!options || options.method === 'GET')
      ) {
        resumeGets++;
        return { ok: true, text: async () => 'not json{{{' };
      }
      return { ok: true, text: async () => '', json: async () => ({}) };
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await adapter.loadState();
    warn.mockRestore();

    // Re-reading identical bytes can't change the answer, so one attempt only.
    expect(resumeGets).toBe(1);
    expect(adapter.getState()).toBeNull();

    mockFetch.mockClear();
    adapter.saveState({ b: 0, v: [0], q: {}, d: 1 });
    await new Promise((r) => setTimeout(r, 0));
    const puts = mockFetch.mock.calls.filter(
      ([url, options]: any[]) =>
        String(url).includes('activities/state') && options?.method === 'PUT',
    );
    expect(puts).toHaveLength(1);
  });

  it('restores state from xAPI State API', async () => {
    const saved: SavedState = { b: 3, v: [0, 1, 2, 3], q: { '2': 80 }, d: 100 };
    setupInitMocks(saved);
    adapter = new CMI5Adapter();
    await adapter.init();
    await adapter.loadState();
    expect(adapter.getState()).toEqual(saved);
  });

  it('returns null state when no saved state', async () => {
    setupInitMocks();
    adapter = new CMI5Adapter();
    await adapter.init();
    await adapter.loadState();
    expect(adapter.getState()).toBeNull();
  });

  it('saves state via PUT to State API', async () => {
    setupInitMocks();
    adapter = new CMI5Adapter();
    await adapter.init();

    mockFetch.mockClear();
    mockFetch.mockResolvedValue({ ok: true });

    const state: SavedState = { b: 5, v: [0, 1, 2], q: {}, d: 200 };
    adapter.saveState(state);

    // Allow fire-and-forget PUT to settle
    await new Promise((r) => setTimeout(r, 50));

    const putCalls = mockFetch.mock.calls.filter(
      (c: any[]) => c[1]?.method === 'PUT',
    );
    expect(putCalls.length).toBe(1);
    expect(putCalls[0][0]).toContain('activities/state');
    expect(JSON.parse(putCalls[0][1].body)).toEqual(state);
  });

  it('sends Completed statement when completion is set to complete', async () => {
    setupInitMocks();
    adapter = new CMI5Adapter();
    await adapter.init();

    mockFetch.mockClear();
    mockFetch.mockResolvedValue({ ok: true });

    adapter.setScore(85);
    adapter.setDuration(3600);
    adapter.setCompletionStatus('complete');

    await new Promise((r) => setTimeout(r, 50));

    const statementCalls = mockFetch.mock.calls.filter((c: any[]) =>
      c[0].includes('statements'),
    );
    expect(statementCalls.length).toBeGreaterThanOrEqual(1);
    const body = JSON.parse(statementCalls[0][1].body);
    expect(body.verb.id).toBe('http://adlnet.gov/expapi/verbs/completed');
    expect(body.result.completion).toBe(true);
    // cmi5 §9.5.1: Completed MUST NOT include `score`. The score (when
    // present) belongs on Passed/Failed only.
    expect(body.result.score).toBeUndefined();
  });

  it('does not send Completed when status is incomplete', async () => {
    setupInitMocks();
    adapter = new CMI5Adapter();
    await adapter.init();

    mockFetch.mockClear();
    mockFetch.mockResolvedValue({ ok: true });

    adapter.setCompletionStatus('incomplete');

    await new Promise((r) => setTimeout(r, 50));

    const statementCalls = mockFetch.mock.calls.filter((c: any[]) =>
      c[0].includes('statements'),
    );
    expect(statementCalls.length).toBe(0);
  });

  it('sends Passed statement on success', async () => {
    setupInitMocks();
    adapter = new CMI5Adapter();
    await adapter.init();

    mockFetch.mockClear();
    mockFetch.mockResolvedValue({ ok: true });

    adapter.setScore(90);
    adapter.setDuration(1800);
    adapter.setSuccessStatus('passed');

    await new Promise((r) => setTimeout(r, 50));

    const statementCalls = mockFetch.mock.calls.filter((c: any[]) =>
      c[0].includes('statements'),
    );
    const body = JSON.parse(statementCalls[0][1].body);
    expect(body.verb.id).toBe('http://adlnet.gov/expapi/verbs/passed');
    expect(body.result.success).toBe(true);
    expect(body.result.score.scaled).toBe(0.9);
  });

  it('sends Failed statement on failure', async () => {
    setupInitMocks();
    adapter = new CMI5Adapter();
    await adapter.init();

    mockFetch.mockClear();
    mockFetch.mockResolvedValue({ ok: true });

    adapter.setScore(40);
    adapter.setSuccessStatus('failed');

    await new Promise((r) => setTimeout(r, 50));

    const statementCalls = mockFetch.mock.calls.filter((c: any[]) =>
      c[0].includes('statements'),
    );
    const body = JSON.parse(statementCalls[0][1].body);
    expect(body.verb.id).toBe('http://adlnet.gov/expapi/verbs/failed');
    expect(body.result.success).toBe(false);
  });

  it('seedLifecycle suppresses duplicate Failed when resuming an already-failed session', async () => {
    setupInitMocks();
    adapter = new CMI5Adapter();
    await adapter.init();

    adapter.seedLifecycle('incomplete', 'failed');

    mockFetch.mockClear();
    mockFetch.mockResolvedValue({ ok: true });

    adapter.setScore(40);
    adapter.setSuccessStatus('failed');

    await new Promise((r) => setTimeout(r, 50));

    const statementCalls = mockFetch.mock.calls.filter(
      (c: any[]) => c[0].includes('statements') && c[1]?.method === 'POST',
    );
    expect(statementCalls).toHaveLength(0);
  });

  it('after seedLifecycle("failed"), a transition to passed still emits Passed', async () => {
    setupInitMocks();
    adapter = new CMI5Adapter();
    await adapter.init();

    adapter.seedLifecycle('incomplete', 'failed');

    mockFetch.mockClear();
    mockFetch.mockResolvedValue({ ok: true });

    adapter.setScore(85);
    adapter.setSuccessStatus('passed');
    adapter.setCompletionStatus('complete');

    await new Promise((r) => setTimeout(r, 50));

    const statementCalls = mockFetch.mock.calls.filter(
      (c: any[]) => c[0].includes('statements') && c[1]?.method === 'POST',
    );
    const verbs = statementCalls.map(
      (c: any[]) => JSON.parse(c[1].body).verb.id,
    );
    expect(verbs).toContain('http://adlnet.gov/expapi/verbs/passed');
    expect(verbs).toContain('http://adlnet.gov/expapi/verbs/completed');
  });

  it('seedLifecycle suppresses duplicate Completed and Passed when resuming a completed session', async () => {
    setupInitMocks();
    adapter = new CMI5Adapter();
    await adapter.init();

    adapter.seedLifecycle('complete', 'passed');

    mockFetch.mockClear();
    mockFetch.mockResolvedValue({ ok: true });

    adapter.setScore(85);
    adapter.setCompletionStatus('complete');
    adapter.setSuccessStatus('passed');

    await new Promise((r) => setTimeout(r, 50));

    const statementCalls = mockFetch.mock.calls.filter(
      (c: any[]) => c[0].includes('statements') && c[1]?.method === 'POST',
    );
    expect(statementCalls).toHaveLength(0);
  });

  it('includes auth header on xAPI requests', async () => {
    setupInitMocks();
    adapter = new CMI5Adapter();
    await adapter.init();

    // Check that statements call includes auth header
    const statementCalls = mockFetch.mock.calls.filter((c: any[]) =>
      c[0].includes('statements'),
    );
    expect(statementCalls.length).toBeGreaterThanOrEqual(1);
    const headers = statementCalls[0][1].headers;
    // cmi5 §6.2: the LMS-issued fetch token is a Basic credential, not a Bearer.
    expect(headers.get('Authorization')).toBe('Basic test-auth-token');
    expect(headers.get('X-Experience-API-Version')).toBe('1.0.3');
  });

  it('uses session id and Publisher Activity from LMS.LaunchData contextTemplate', async () => {
    // cmi5 §9.6.2 — the AU MUST use the contextTemplate from
    // LMS.LaunchData as the base context on every Defined Statement.
    // Per §9.6.2.3 the Publisher Activity in `grouping` and per
    // §9.6.3.1 the session id extension are LMS-chosen values; strict
    // LRSes (SCORM Cloud) reject statements that don't carry them
    // verbatim ("Forbidden cmi5 defined statement: ... does not
    // contain Publisher Activity" / "session id does not match
    // request context").
    const lmsSession = '11111111-2222-3333-4444-555555555555';
    const publisherActivity = 'https://lms.example.com/courses/abc';
    setupInitMocks(undefined, {
      contextTemplate: {
        contextActivities: {
          grouping: [{ id: publisherActivity }],
        },
        extensions: {
          'https://w3id.org/xapi/cmi5/context/extensions/sessionid': lmsSession,
        },
      },
    });
    adapter = new CMI5Adapter();
    await adapter.init();

    const initialized = mockFetch.mock.calls
      .map((c: any[]) => {
        try {
          return JSON.parse(c[1]?.body);
        } catch {
          return null;
        }
      })
      .find(
        (b: any) =>
          b?.verb?.id === 'http://adlnet.gov/expapi/verbs/initialized',
      );
    expect(initialized).toBeDefined();
    expect(
      initialized.context.extensions[
        'https://w3id.org/xapi/cmi5/context/extensions/sessionid'
      ],
    ).toBe(lmsSession);
    expect(initialized.context.contextActivities.grouping).toEqual([
      { id: publisherActivity },
    ]);
  });

  it('falls back to a minted UUID when LMS.LaunchData has no session id', async () => {
    // When the LMS doesn't pre-populate sessionid (non-conformant or
    // dev fixtures), the publisher mints a UUID — the cmi5 v1 fallback.
    setupInitMocks();
    adapter = new CMI5Adapter();
    await adapter.init();

    const initialized = mockFetch.mock.calls
      .map((c: any[]) => {
        try {
          return JSON.parse(c[1]?.body);
        } catch {
          return null;
        }
      })
      .find(
        (b: any) =>
          b?.verb?.id === 'http://adlnet.gov/expapi/verbs/initialized',
      );
    const sid =
      initialized?.context?.extensions?.[
        'https://w3id.org/xapi/cmi5/context/extensions/sessionid'
      ];
    expect(sid).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it('parses the spec-conformant JSON token body from the fetch URL', async () => {
    // cmi5 §11.2: the fetch endpoint returns
    //   { "auth-token": "<base64-encoded credentials>" }
    // Stuffing the entire JSON string into `Basic <...>` produces the
    // "Malformed authorization header" 400 SCORM Cloud returns.
    mockFetch.mockImplementation(async (url: string, options?: RequestInit) => {
      if (url === baseLaunchParams.fetch) {
        return {
          ok: true,
          text: async () => '{"auth-token": "spec-conformant-token"}',
        };
      }
      if (
        url.includes('activities/state') &&
        (!options || options.method === 'GET')
      ) {
        return { ok: false, status: 404 };
      }
      if (url.includes('statements')) {
        return { ok: true };
      }
      return { ok: false, status: 404 };
    });
    adapter = new CMI5Adapter();
    await adapter.init();

    const statementCalls = mockFetch.mock.calls.filter((c: any[]) =>
      c[0].includes('statements'),
    );
    const headers = statementCalls[0][1].headers;
    expect(headers.get('Authorization')).toBe('Basic spec-conformant-token');
  });

  it('throws when fetch URL returns a spec-defined error JSON instead of a token', async () => {
    mockFetch.mockImplementation(async (url: string) => {
      if (url === baseLaunchParams.fetch) {
        return {
          ok: true,
          text: async () =>
            '{"error-code":"1","error-text":"The authorization token has already been returned."}',
        };
      }
      return { ok: false, status: 404 };
    });
    adapter = new CMI5Adapter();
    await expect(adapter.init()).rejects.toThrow(
      /error-code=1.*already been returned/,
    );
    const statementCalls = mockFetch.mock.calls.filter((c: any[]) =>
      c[0].includes('statements'),
    );
    expect(statementCalls.length).toBe(0);
  });

  it('includes registration and context in statements', async () => {
    setupInitMocks();
    adapter = new CMI5Adapter();
    await adapter.init();

    const statementCalls = mockFetch.mock.calls.filter((c: any[]) =>
      c[0].includes('statements'),
    );
    const body = JSON.parse(statementCalls[0][1].body);
    expect(body.context.registration).toBe('reg-123');
    expect(body.object.id).toBe('https://example.com/course/1');
    expect(body.actor).toEqual({
      mbox: 'mailto:test@example.com',
      name: 'Test User',
    });
  });

  it('commit is a no-op', async () => {
    setupInitMocks();
    adapter = new CMI5Adapter();
    await adapter.init();
    mockFetch.mockClear();

    adapter.commit();

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('terminate sends Terminated only — cmi5 has no Suspended verb (§9.3)', async () => {
    // The cmi5 §9.3 verb enumeration covers nine verbs and "Suspended"
    // is not among them. An incomplete-exit signal is conveyed by the
    // *absence* of Completed before Terminated; the LMS handles
    // resume / Abandoned itself from the registration state.
    setupInitMocks();
    adapter = new CMI5Adapter();
    await adapter.init();

    mockFetch.mockClear();
    mockFetch.mockResolvedValue({ ok: true });

    adapter.setDuration(120);
    adapter.terminate();

    await new Promise((r) => setTimeout(r, 50));

    const statementCalls = mockFetch.mock.calls.filter((c: any[]) =>
      c[0]?.includes('statements'),
    );
    expect(statementCalls.length).toBe(1);
    const terminated = JSON.parse(statementCalls[0][1].body);
    expect(terminated.verb.id).toBe(
      'http://adlnet.gov/expapi/verbs/terminated',
    );
    // cmi5 §9.5.4.1 — Terminated must include result.duration.
    expect(terminated.result.duration).toBe('PT2M');
    // Nothing with a "suspended" verb.
    const verbs = statementCalls.map((c: any[]) => {
      try {
        return JSON.parse(c[1].body).verb.id;
      } catch {
        return null;
      }
    });
    expect(verbs).not.toContain('http://adlnet.gov/expapi/verbs/suspended');
  });

  it('terminate sends Terminated only (no Suspended) after course is completed', async () => {
    setupInitMocks();
    adapter = new CMI5Adapter();
    await adapter.init();

    adapter.setScore(85);
    adapter.setDuration(60);
    adapter.setCompletionStatus('complete');
    await new Promise((r) => setTimeout(r, 20));

    mockFetch.mockClear();
    mockFetch.mockResolvedValue({ ok: true });

    adapter.terminate();
    await new Promise((r) => setTimeout(r, 50));

    const statementCalls = mockFetch.mock.calls.filter((c: any[]) =>
      c[0]?.includes('statements'),
    );
    expect(statementCalls.length).toBe(1);
    const body = JSON.parse(statementCalls[0][1].body);
    expect(body.verb.id).toBe('http://adlnet.gov/expapi/verbs/terminated');
    expect(body.result.duration).toBe('PT1M');
  });

  it('terminate is idempotent', async () => {
    setupInitMocks();
    adapter = new CMI5Adapter();
    await adapter.init();

    adapter.setCompletionStatus('complete');
    await new Promise((r) => setTimeout(r, 20));

    mockFetch.mockClear();
    mockFetch.mockResolvedValue({ ok: true });

    adapter.terminate();
    adapter.terminate();

    await new Promise((r) => setTimeout(r, 50));

    const statementCalls = mockFetch.mock.calls.filter((c: any[]) =>
      c[0]?.includes('statements'),
    );
    expect(statementCalls.length).toBe(1);
  });

  describe('LMS launch params: masteryScore + moveOn (cmi5 §8, §9.5.3)', () => {
    it('parses masteryScore and exposes it via getMasteryScore()', async () => {
      setSearchParams({ ...baseLaunchParams, masteryScore: '0.8' });
      setupInitMocks();
      adapter = new CMI5Adapter();
      await adapter.init();
      expect(adapter.getMasteryScore()).toBe(0.8);
    });

    it('returns null when no masteryScore is present', async () => {
      setupInitMocks();
      adapter = new CMI5Adapter();
      await adapter.init();
      expect(adapter.getMasteryScore()).toBeNull();
    });

    it('rejects masteryScore outside [0, 1] and warns', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      setSearchParams({ ...baseLaunchParams, masteryScore: '1.5' });
      setupInitMocks();
      adapter = new CMI5Adapter();
      await adapter.init();
      expect(adapter.getMasteryScore()).toBeNull();
      expect(
        warn.mock.calls.some((c: any[]) =>
          String(c[0]).includes('masteryScore'),
        ),
      ).toBe(true);
      warn.mockRestore();
    });

    it('does NOT attach masteryscore extension to Completed (§9.6.3.2 scopes it to Passed/Failed)', async () => {
      setSearchParams({ ...baseLaunchParams, masteryScore: '0.7' });
      setupInitMocks();
      adapter = new CMI5Adapter();
      await adapter.init();
      mockFetch.mockClear();
      mockFetch.mockResolvedValue({ ok: true });

      adapter.setScore(85);
      adapter.setDuration(60);
      adapter.setCompletionStatus('complete');
      await new Promise((r) => setTimeout(r, 50));

      const completed = mockFetch.mock.calls
        .map((c: any[]) => {
          try {
            return JSON.parse(c[1]?.body);
          } catch {
            return null;
          }
        })
        .find(
          (b: any) =>
            b?.verb?.id === 'http://adlnet.gov/expapi/verbs/completed',
        );
      expect(completed).toBeDefined();
      const ext = completed?.context?.extensions ?? {};
      expect(
        ext['https://w3id.org/xapi/cmi5/context/extensions/masteryscore'],
      ).toBeUndefined();
    });

    it('attaches masteryscore extension to Passed and Failed', async () => {
      setSearchParams({ ...baseLaunchParams, masteryScore: '0.6' });
      setupInitMocks();
      adapter = new CMI5Adapter();
      await adapter.init();
      mockFetch.mockClear();
      mockFetch.mockResolvedValue({ ok: true });

      adapter.setScore(40);
      adapter.setSuccessStatus('failed');
      await new Promise((r) => setTimeout(r, 50));

      const failed = mockFetch.mock.calls
        .map((c: any[]) => {
          try {
            return JSON.parse(c[1]?.body);
          } catch {
            return null;
          }
        })
        .find(
          (b: any) => b?.verb?.id === 'http://adlnet.gov/expapi/verbs/failed',
        );
      expect(
        failed.context.extensions[
          'https://w3id.org/xapi/cmi5/context/extensions/masteryscore'
        ],
      ).toBe(0.6);
    });

    it('omits the extension entirely when masteryScore is absent', async () => {
      setupInitMocks();
      adapter = new CMI5Adapter();
      await adapter.init();
      mockFetch.mockClear();
      mockFetch.mockResolvedValue({ ok: true });

      adapter.setScore(85);
      adapter.setCompletionStatus('complete');
      await new Promise((r) => setTimeout(r, 50));

      const completed = mockFetch.mock.calls
        .map((c: any[]) => {
          try {
            return JSON.parse(c[1]?.body);
          } catch {
            return null;
          }
        })
        .find(
          (b: any) =>
            b?.verb?.id === 'http://adlnet.gov/expapi/verbs/completed',
        );
      const ext = completed?.context?.extensions ?? {};
      expect(
        ext['https://w3id.org/xapi/cmi5/context/extensions/masteryscore'],
      ).toBeUndefined();
    });

    it('NEVER emits Satisfied — that statement is LMS-only (cmi5 §9.3.9)', async () => {
      // SCORM Cloud (and every strict cmi5 LRS) rejects AU-originated
      // Satisfied with "Forbidden cmi5 defined statement: origin of
      // statement does not match request context". The LMS issues
      // Satisfied itself when the moveOn criterion is met; the AU's
      // job is to emit Completed/Passed/Failed accurately and let the
      // LMS roll up. Exercising every combination of moveOn here
      // protects against a future "MAY send" comment slipping back in.
      for (const moveOn of [
        'Passed',
        'Completed',
        'CompletedAndPassed',
        'CompletedOrPassed',
      ]) {
        setSearchParams({ ...baseLaunchParams, moveOn, masteryScore: '0.7' });
        setupInitMocks();
        adapter = new CMI5Adapter();
        await adapter.init();
        mockFetch.mockClear();
        mockFetch.mockResolvedValue({ ok: true });

        adapter.setScore(90);
        adapter.setCompletionStatus('complete');
        adapter.setSuccessStatus('passed');
        await new Promise((r) => setTimeout(r, 50));

        const verbs = mockFetch.mock.calls.map((c: any[]) => {
          try {
            return JSON.parse(c[1]?.body)?.verb?.id;
          } catch {
            return null;
          }
        });
        expect(verbs).not.toContain(
          'https://w3id.org/xapi/adl/verbs/satisfied',
        );
      }
    });
  });

  describe('cmi5 §9.6 Context Categories', () => {
    // The cmi5 spec is strict: a conformant LRS rolls up Completed/Passed/
    // Failed into the AU's lifecycle state only when these categories
    // are present. Without them, the LMS accepts the POST but treats the
    // statement as an opaque xAPI verb — the learner never registers as
    // having finished the course.
    const CMI5_CAT = 'https://w3id.org/xapi/cmi5/context/categories/cmi5';
    const MOVEON_CAT = 'https://w3id.org/xapi/cmi5/context/categories/moveon';

    function categoryIds(body: any): string[] {
      const cats = body?.context?.contextActivities?.category ?? [];
      return cats
        .map((c: any) => c?.id)
        .filter((id: any) => typeof id === 'string');
    }

    function statementFor(verbId: string): any {
      return mockFetch.mock.calls
        .map((c: any[]) => {
          try {
            return JSON.parse(c[1]?.body);
          } catch {
            return null;
          }
        })
        .find((b: any) => b?.verb?.id === verbId);
    }

    it('tags Initialized with the cmi5 category', async () => {
      setupInitMocks();
      adapter = new CMI5Adapter();
      await adapter.init();
      const initialized = statementFor(
        'http://adlnet.gov/expapi/verbs/initialized',
      );
      expect(categoryIds(initialized)).toEqual([CMI5_CAT]);
    });

    it('tags Completed with cmi5 + moveOn categories', async () => {
      setupInitMocks();
      adapter = new CMI5Adapter();
      await adapter.init();
      mockFetch.mockClear();
      mockFetch.mockResolvedValue({ ok: true });
      adapter.setCompletionStatus('complete');
      await new Promise((r) => setTimeout(r, 50));
      const completed = statementFor(
        'http://adlnet.gov/expapi/verbs/completed',
      );
      expect(categoryIds(completed)).toEqual([CMI5_CAT, MOVEON_CAT]);
    });

    it('tags Passed and Failed with cmi5 + moveOn categories', async () => {
      setupInitMocks();
      adapter = new CMI5Adapter();
      await adapter.init();
      mockFetch.mockClear();
      mockFetch.mockResolvedValue({ ok: true });
      adapter.setSuccessStatus('passed');
      await new Promise((r) => setTimeout(r, 50));
      const passed = statementFor('http://adlnet.gov/expapi/verbs/passed');
      expect(categoryIds(passed)).toEqual([CMI5_CAT, MOVEON_CAT]);

      const adapter2 = new CMI5Adapter();
      setupInitMocks();
      await adapter2.init();
      mockFetch.mockClear();
      mockFetch.mockResolvedValue({ ok: true });
      adapter2.setSuccessStatus('failed');
      await new Promise((r) => setTimeout(r, 50));
      const failed = statementFor('http://adlnet.gov/expapi/verbs/failed');
      expect(categoryIds(failed)).toEqual([CMI5_CAT, MOVEON_CAT]);
    });

    it('tags Terminated with the cmi5 category only', async () => {
      setupInitMocks();
      adapter = new CMI5Adapter();
      await adapter.init();
      mockFetch.mockClear();
      mockFetch.mockResolvedValue({ ok: true });
      adapter.terminate();
      await new Promise((r) => setTimeout(r, 50));
      const terminated = statementFor(
        'http://adlnet.gov/expapi/verbs/terminated',
      );
      expect(categoryIds(terminated)).toEqual([CMI5_CAT]);
    });

    it('does NOT tag Answered with the cmi5 category (it is an Allowed Statement, not Defined)', async () => {
      setupInitMocks();
      adapter = new CMI5Adapter();
      await adapter.init();
      mockFetch.mockClear();
      mockFetch.mockResolvedValue({ ok: true });
      adapter.reportInteraction(
        'q1',
        { type: 'choice', response: ['a'], correct: ['a'] },
        true,
      );
      await new Promise((r) => setTimeout(r, 50));
      const answered = statementFor('http://adlnet.gov/expapi/verbs/answered');
      expect(categoryIds(answered)).not.toContain(CMI5_CAT);
      expect(categoryIds(answered)).not.toContain(MOVEON_CAT);
    });
  });

  describe('reportInteraction', () => {
    async function initAndReport(
      questionId: string,
      interaction: any,
      correct: boolean | null,
    ): Promise<any> {
      setupInitMocks();
      adapter = new CMI5Adapter();
      await adapter.init();
      mockFetch.mockClear();
      mockFetch.mockResolvedValue({ ok: true });
      adapter.reportInteraction(questionId, interaction, correct);
      await new Promise((r) => setTimeout(r, 50));
      const statementCalls = mockFetch.mock.calls.filter((c: any[]) =>
        c[0]?.includes('statements'),
      );
      expect(statementCalls.length).toBe(1);
      return JSON.parse(statementCalls[0][1].body);
    }

    it('sends xAPI answered statement for choice', async () => {
      const body = await initAndReport(
        'q1',
        { type: 'choice', response: ['a', 'b'], correct: ['a'] },
        false,
      );
      expect(body.verb.id).toBe('http://adlnet.gov/expapi/verbs/answered');
      expect(body.object.id).toBe('https://example.com/course/1#q1');
      expect(body.object.definition.type).toBe(
        'http://adlnet.gov/expapi/activities/cmi.interaction',
      );
      expect(body.object.definition.interactionType).toBe('choice');
      expect(body.object.definition.correctResponsesPattern).toEqual(['a']);
      expect(body.result.response).toBe('a[,]b');
      expect(body.result.success).toBe(false);
    });

    it('passes named identifiers through to result.response unchanged (xAPI has no CMIIdentifier validation)', async () => {
      const body = await initAndReport(
        'q1',
        {
          type: 'choice',
          response: ['speed-limit', 'no-entry'],
          correct: ['speed-limit'],
        },
        true,
      );
      expect(body.result.response).toBe('speed-limit[,]no-entry');
      expect(body.object.definition.correctResponsesPattern).toEqual([
        'speed-limit',
      ]);
    });

    it('ignores `options` for index mapping and keeps named identifiers in result.response', async () => {
      const body = await initAndReport(
        'q1',
        {
          type: 'choice',
          response: ['speed-limit'],
          correct: ['speed-limit'],
          options: ['stop', 'yield', 'speed-limit', 'merge'],
        },
        true,
      );
      expect(body.result.response).toBe('speed-limit');
      expect(body.object.definition.correctResponsesPattern).toEqual([
        'speed-limit',
      ]);
    });

    it('prefixes fill-in patterns with case_matters when set', async () => {
      const body = await initAndReport(
        'q1',
        {
          type: 'fill-in',
          response: 'Paris',
          correct: ['Paris', 'paris'],
          caseMatters: true,
        },
        true,
      );
      expect(body.object.definition.correctResponsesPattern).toEqual([
        '{case_matters=true}Paris',
        '{case_matters=true}paris',
      ]);
    });

    it('omits correctResponsesPattern when no correct provided', async () => {
      const body = await initAndReport(
        'q1',
        { type: 'likert', response: 'agree' },
        null,
      );
      expect(body.object.definition.correctResponsesPattern).toBeUndefined();
      expect(body.result.success).toBeUndefined();
      expect(body.result.response).toBe('agree');
    });

    it('encodes matching response with pair delimiter', async () => {
      const body = await initAndReport(
        'm1',
        {
          type: 'matching',
          response: [
            ['a', '1'],
            ['b', '2'],
          ],
          correct: [
            ['a', '1'],
            ['b', '2'],
          ],
        },
        true,
      );
      expect(body.object.definition.interactionType).toBe('matching');
      expect(body.result.response).toBe('a[.]1[,]b[.]2');
      expect(body.object.definition.correctResponsesPattern).toEqual([
        'a[.]1[,]b[.]2',
      ]);
    });

    it('encodes numeric range with colon delimiter', async () => {
      const body = await initAndReport(
        'n1',
        { type: 'numeric', response: 7, correct: { min: 5, max: 10 } },
        true,
      );
      expect(body.result.response).toBe('7');
      expect(body.object.definition.correctResponsesPattern).toEqual([
        '5[:]10',
      ]);
    });
  });

  describe('exit() — returnURL redirect (cmi5 §10.2.6)', () => {
    function findStatement(verbId: string): any {
      return mockFetch.mock.calls
        .map((c: any[]) => {
          try {
            return JSON.parse(c[1]?.body);
          } catch {
            return null;
          }
        })
        .find((b: any) => b?.verb?.id === verbId);
    }

    it('redirects to LMS-supplied returnURL after sending Terminated', async () => {
      const returnURL = 'https://lms.example.com/learner/done';
      setupInitMocks(undefined, { returnURL });
      adapter = new CMI5Adapter();
      await adapter.init();

      const assign = vi.fn();
      vi.stubGlobal('window', {
        ...globalThis.window,
        location: { ...globalThis.window.location, assign },
      });
      mockFetch.mockClear();
      mockFetch.mockResolvedValue({ ok: true });

      await adapter.exit();
      expect(
        findStatement('http://adlnet.gov/expapi/verbs/terminated'),
      ).toBeDefined();
      expect(assign).toHaveBeenCalledWith(returnURL);
    });

    it('still terminates but skips redirect when LMS did not supply a returnURL', async () => {
      setupInitMocks();
      adapter = new CMI5Adapter();
      await adapter.init();

      const assign = vi.fn();
      vi.stubGlobal('window', {
        ...globalThis.window,
        location: { ...globalThis.window.location, assign },
      });
      mockFetch.mockClear();
      mockFetch.mockResolvedValue({ ok: true });

      await adapter.exit();
      expect(
        findStatement('http://adlnet.gov/expapi/verbs/terminated'),
      ).toBeDefined();
      expect(assign).not.toHaveBeenCalled();
    });
  });

  describe('LMS.LaunchData fields (cmi5 §10.2)', () => {
    function findStatement(verbId: string): any {
      return mockFetch.mock.calls
        .map((c: any[]) => {
          try {
            return JSON.parse(c[1]?.body);
          } catch {
            return null;
          }
        })
        .find((b: any) => b?.verb?.id === verbId);
    }

    it('exposes launchMode from LaunchData via getter', async () => {
      setupInitMocks(undefined, { launchMode: 'Review' });
      adapter = new CMI5Adapter();
      await adapter.init();
      expect(adapter.getLaunchMode()).toBe('Review');
    });

    it('defaults launchMode to Normal when LaunchData is absent', async () => {
      setupInitMocks();
      adapter = new CMI5Adapter();
      await adapter.init();
      expect(adapter.getLaunchMode()).toBe('Normal');
    });

    it('rejects invalid launchMode values and falls back to Normal', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      setupInitMocks(undefined, { launchMode: 'NotARealMode' });
      adapter = new CMI5Adapter();
      await adapter.init();
      expect(adapter.getLaunchMode()).toBe('Normal');
      warn.mockRestore();
    });

    it('prefers LaunchData.masteryScore over the URL launch param (§10.2.4)', async () => {
      // URL says 0.5, LaunchData says 0.8 — LaunchData is the authoritative
      // source per the spec (§10.2.4). The URL form is non-standard.
      setSearchParams({ ...baseLaunchParams, masteryScore: '0.5' });
      setupInitMocks(undefined, { masteryScore: 0.8 });
      adapter = new CMI5Adapter();
      await adapter.init();
      expect(adapter.getMasteryScore()).toBe(0.8);
    });

    it('does NOT emit Completed under launchMode=Browse (§10.2.2)', async () => {
      setupInitMocks(undefined, { launchMode: 'Browse' });
      adapter = new CMI5Adapter();
      await adapter.init();
      mockFetch.mockClear();
      mockFetch.mockResolvedValue({ ok: true });
      adapter.setCompletionStatus('complete');
      await new Promise((r) => setTimeout(r, 50));
      expect(
        findStatement('http://adlnet.gov/expapi/verbs/completed'),
      ).toBeUndefined();
    });

    it('does NOT emit Passed or Failed under launchMode=Review (§10.2.2)', async () => {
      setupInitMocks(undefined, { launchMode: 'Review' });
      adapter = new CMI5Adapter();
      await adapter.init();
      mockFetch.mockClear();
      mockFetch.mockResolvedValue({ ok: true });
      adapter.setScore(95);
      adapter.setSuccessStatus('passed');
      await new Promise((r) => setTimeout(r, 50));
      expect(
        findStatement('http://adlnet.gov/expapi/verbs/passed'),
      ).toBeUndefined();
      expect(
        findStatement('http://adlnet.gov/expapi/verbs/failed'),
      ).toBeUndefined();
    });

    it('does NOT emit Suspended under launchMode=Browse on terminate (§10.2.2)', async () => {
      setupInitMocks(undefined, { launchMode: 'Browse' });
      adapter = new CMI5Adapter();
      await adapter.init();
      mockFetch.mockClear();
      mockFetch.mockResolvedValue({ ok: true });
      adapter.terminate();
      await new Promise((r) => setTimeout(r, 50));
      expect(
        findStatement('http://adlnet.gov/expapi/verbs/suspended'),
      ).toBeUndefined();
      // Terminated is always allowed.
      expect(
        findStatement('http://adlnet.gov/expapi/verbs/terminated'),
      ).toBeDefined();
    });

    it('fetches Learner Preferences BEFORE sending Initialized (§11)', async () => {
      // cmi5 §11 requires the AU to retrieve the Learner Preferences
      // document. SCORM Cloud enforces this by rejecting Initialized
      // with "The AU must retrieve Learner Preferences document from
      // the Agent Profile" if the AU hits /statements before
      // /agents/profile. The order matters even when the prefs doc
      // itself 404s (no preferences set is a valid state).
      setupInitMocks();
      adapter = new CMI5Adapter();
      await adapter.init();

      const callOrder = mockFetch.mock.calls.map((c: any[]) => c[0] as string);
      const profileIdx = callOrder.findIndex((u) =>
        u.includes('agents/profile'),
      );
      const initializedIdx = callOrder.findIndex(
        (u, i) =>
          u.includes('statements') &&
          (() => {
            try {
              return (
                JSON.parse(mockFetch.mock.calls[i][1]?.body)?.verb?.id ===
                'http://adlnet.gov/expapi/verbs/initialized'
              );
            } catch {
              return false;
            }
          })(),
      );
      expect(profileIdx).toBeGreaterThanOrEqual(0);
      expect(initializedIdx).toBeGreaterThanOrEqual(0);
      expect(profileIdx).toBeLessThan(initializedIdx);
    });
  });

  describe('contextTemplate merge (cmi5 §10.2.1)', () => {
    function findStatement(verbId: string): any {
      return mockFetch.mock.calls
        .map((c: any[]) => {
          try {
            return JSON.parse(c[1]?.body);
          } catch {
            return null;
          }
        })
        .find((b: any) => b?.verb?.id === verbId);
    }

    it('concats LMS-supplied template categories with cmi5 + moveOn instead of overwriting', async () => {
      // cmi5 §10.2.1 — the AU MUST NOT overwrite contextTemplate values.
      // If the LMS pre-populates `category`, the AU must merge (concat
      // + dedupe), not replace.
      const lmsCategory = {
        id: 'https://lms.example.com/cat/custom',
        objectType: 'Activity',
      };
      setupInitMocks(undefined, {
        contextTemplate: {
          contextActivities: { category: [lmsCategory] },
        },
      });
      adapter = new CMI5Adapter();
      await adapter.init();
      mockFetch.mockClear();
      mockFetch.mockResolvedValue({ ok: true });
      adapter.setCompletionStatus('complete');
      await new Promise((r) => setTimeout(r, 50));
      const completed = findStatement(
        'http://adlnet.gov/expapi/verbs/completed',
      );
      const ids = completed.context.contextActivities.category.map(
        (c: any) => c.id,
      );
      expect(ids).toContain(lmsCategory.id);
      expect(ids).toContain(
        'https://w3id.org/xapi/cmi5/context/categories/cmi5',
      );
      expect(ids).toContain(
        'https://w3id.org/xapi/cmi5/context/categories/moveon',
      );
    });
  });

  describe('score validation (cmi5 §9.5.1, §9.3.4)', () => {
    function findStatement(verbId: string): any {
      return mockFetch.mock.calls
        .map((c: any[]) => {
          try {
            return JSON.parse(c[1]?.body);
          } catch {
            return null;
          }
        })
        .find((b: any) => b?.verb?.id === verbId);
    }

    it('clamps setScore to [0, 100] so scaled stays in [0, 1] (xAPI)', async () => {
      // Score is asserted on Passed (not Completed) because cmi5 §9.5.1
      // forbids score on Completed.
      setupInitMocks();
      adapter = new CMI5Adapter();
      await adapter.init();
      mockFetch.mockClear();
      mockFetch.mockResolvedValue({ ok: true });

      adapter.setScore(150);
      adapter.setSuccessStatus('passed');
      await new Promise((r) => setTimeout(r, 50));
      const passed = findStatement('http://adlnet.gov/expapi/verbs/passed');
      expect(passed.result.score.scaled).toBe(1);
    });

    it('omits scaled score on Passed when below masteryScore (§9.3.4)', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      setupInitMocks(undefined, { masteryScore: 0.8 });
      adapter = new CMI5Adapter();
      await adapter.init();
      mockFetch.mockClear();
      mockFetch.mockResolvedValue({ ok: true });

      adapter.setScore(50); // scaled = 0.5, below mastery 0.8
      adapter.setSuccessStatus('passed');
      await new Promise((r) => setTimeout(r, 50));
      const passed = findStatement('http://adlnet.gov/expapi/verbs/passed');
      expect(passed).toBeDefined();
      // The Passed verb is still emitted (author asserted it) but
      // without a score that would make the statement non-conformant.
      expect(passed.result.score).toBeUndefined();
      warn.mockRestore();
    });

    it('keeps scaled score on Passed when at or above masteryScore', async () => {
      setupInitMocks(undefined, { masteryScore: 0.7 });
      adapter = new CMI5Adapter();
      await adapter.init();
      mockFetch.mockClear();
      mockFetch.mockResolvedValue({ ok: true });

      adapter.setScore(85);
      adapter.setSuccessStatus('passed');
      await new Promise((r) => setTimeout(r, 50));
      const passed = findStatement('http://adlnet.gov/expapi/verbs/passed');
      expect(passed.result.score.scaled).toBeCloseTo(0.85);
    });

    it('keeps scaled score on Failed when below mastery', async () => {
      setupInitMocks(undefined, { masteryScore: 0.7 });
      adapter = new CMI5Adapter();
      await adapter.init();
      mockFetch.mockClear();
      mockFetch.mockResolvedValue({ ok: true });

      adapter.setScore(40);
      adapter.setSuccessStatus('failed');
      await new Promise((r) => setTimeout(r, 50));
      const failed = findStatement('http://adlnet.gov/expapi/verbs/failed');
      expect(failed.result.score.scaled).toBeCloseTo(0.4);
    });

    it('omits scaled score on Failed when at or above masteryScore (§9.3.5)', async () => {
      // Symmetric to the Passed/§9.3.4 invariant: a Failed statement
      // carrying a score MUST have scaled < masteryScore.
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      setupInitMocks(undefined, { masteryScore: 0.7 });
      adapter = new CMI5Adapter();
      await adapter.init();
      mockFetch.mockClear();
      mockFetch.mockResolvedValue({ ok: true });

      adapter.setScore(85); // scaled = 0.85, above mastery 0.7
      adapter.setSuccessStatus('failed');
      await new Promise((r) => setTimeout(r, 50));
      const failed = findStatement('http://adlnet.gov/expapi/verbs/failed');
      expect(failed).toBeDefined();
      expect(failed.result.score).toBeUndefined();
      warn.mockRestore();
    });
  });
});
