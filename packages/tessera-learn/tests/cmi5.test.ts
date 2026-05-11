// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CMI5Adapter } from '../src/runtime/adapters/cmi5.js';
import { hasCMI5LaunchParams } from '../src/runtime/adapters/discovery.js';
import type { SavedState } from '../src/runtime/persistence.js';

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

  function setupInitMocks(savedState?: SavedState) {
    mockFetch.mockImplementation(async (url: string, options?: RequestInit) => {
      // Token fetch
      if (url === baseLaunchParams.fetch) {
        return { ok: true, text: async () => 'test-auth-token' };
      }
      // State API GET
      if (url.includes('activities/state') && (!options || options.method === 'GET')) {
        if (savedState) {
          return { ok: true, json: async () => savedState };
        }
        return { ok: false, status: 404 };
      }
      // Statements POST (Initialized)
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
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('sends Initialized statement on init', async () => {
    setupInitMocks();
    adapter = new CMI5Adapter();
    await adapter.init();

    const statementCalls = mockFetch.mock.calls.filter(
      (c: any[]) => c[0].includes('statements') && c[1]?.method === 'POST'
    );
    expect(statementCalls.length).toBeGreaterThanOrEqual(1);
    const body = JSON.parse(statementCalls[0][1].body);
    expect(body.verb.id).toBe('http://adlnet.gov/expapi/verbs/initialized');
  });

  it('restores state from xAPI State API', async () => {
    const saved: SavedState = { b: 3, v: [0, 1, 2, 3], q: { '2': 80 }, d: 100 };
    setupInitMocks(saved);
    adapter = new CMI5Adapter();
    await adapter.init();
    expect(adapter.getState()).toEqual(saved);
  });

  it('returns null state when no saved state', async () => {
    setupInitMocks();
    adapter = new CMI5Adapter();
    await adapter.init();
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
      (c: any[]) => c[1]?.method === 'PUT'
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

    const statementCalls = mockFetch.mock.calls.filter(
      (c: any[]) => c[0].includes('statements')
    );
    expect(statementCalls.length).toBeGreaterThanOrEqual(1);
    const body = JSON.parse(statementCalls[0][1].body);
    expect(body.verb.id).toBe('http://adlnet.gov/expapi/verbs/completed');
    expect(body.result.completion).toBe(true);
    expect(body.result.score.scaled).toBe(0.85);
  });

  it('does not send Completed when status is incomplete', async () => {
    setupInitMocks();
    adapter = new CMI5Adapter();
    await adapter.init();

    mockFetch.mockClear();
    mockFetch.mockResolvedValue({ ok: true });

    adapter.setCompletionStatus('incomplete');

    await new Promise((r) => setTimeout(r, 50));

    const statementCalls = mockFetch.mock.calls.filter(
      (c: any[]) => c[0].includes('statements')
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

    const statementCalls = mockFetch.mock.calls.filter(
      (c: any[]) => c[0].includes('statements')
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

    const statementCalls = mockFetch.mock.calls.filter(
      (c: any[]) => c[0].includes('statements')
    );
    const body = JSON.parse(statementCalls[0][1].body);
    expect(body.verb.id).toBe('http://adlnet.gov/expapi/verbs/failed');
    expect(body.result.success).toBe(false);
  });

  it('includes auth header on xAPI requests', async () => {
    setupInitMocks();
    adapter = new CMI5Adapter();
    await adapter.init();

    // Check that statements call includes auth header
    const statementCalls = mockFetch.mock.calls.filter(
      (c: any[]) => c[0].includes('statements')
    );
    expect(statementCalls.length).toBeGreaterThanOrEqual(1);
    const headers = statementCalls[0][1].headers;
    // cmi5 §6.2: the LMS-issued fetch token is a Basic credential, not a Bearer.
    expect(headers.get('Authorization')).toBe('Basic test-auth-token');
    expect(headers.get('X-Experience-API-Version')).toBe('1.0.3');
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
      if (url.includes('activities/state') && (!options || options.method === 'GET')) {
        return { ok: false, status: 404 };
      }
      if (url.includes('statements')) {
        return { ok: true };
      }
      return { ok: false, status: 404 };
    });
    adapter = new CMI5Adapter();
    await adapter.init();

    const statementCalls = mockFetch.mock.calls.filter(
      (c: any[]) => c[0].includes('statements')
    );
    const headers = statementCalls[0][1].headers;
    expect(headers.get('Authorization')).toBe('Basic spec-conformant-token');
  });

  it('includes registration and context in statements', async () => {
    setupInitMocks();
    adapter = new CMI5Adapter();
    await adapter.init();

    const statementCalls = mockFetch.mock.calls.filter(
      (c: any[]) => c[0].includes('statements')
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

  it('terminate sends Suspended then Terminated when not completed (cmi5 §10.1)', async () => {
    setupInitMocks();
    adapter = new CMI5Adapter();
    await adapter.init();

    mockFetch.mockClear();
    mockFetch.mockResolvedValue({ ok: true });

    adapter.setDuration(120);
    adapter.terminate();

    await new Promise((r) => setTimeout(r, 50));

    const statementCalls = mockFetch.mock.calls.filter(
      (c: any[]) => c[0]?.includes('statements')
    );
    expect(statementCalls.length).toBe(2);
    const suspended = JSON.parse(statementCalls[0][1].body);
    const terminated = JSON.parse(statementCalls[1][1].body);
    expect(suspended.verb.id).toBe('http://adlnet.gov/expapi/verbs/suspended');
    expect(suspended.result.duration).toBe('PT2M');
    expect(terminated.verb.id).toBe('http://adlnet.gov/expapi/verbs/terminated');
    // cmi5 §9.5.4.1 — Terminated must include result.duration.
    expect(terminated.result.duration).toBe('PT2M');
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

    const statementCalls = mockFetch.mock.calls.filter(
      (c: any[]) => c[0]?.includes('statements')
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

    const statementCalls = mockFetch.mock.calls.filter(
      (c: any[]) => c[0]?.includes('statements')
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
      expect(warn.mock.calls.some((c: any[]) =>
        String(c[0]).includes("masteryScore")
      )).toBe(true);
      warn.mockRestore();
    });

    it('parses moveOn and defaults to NotApplicable', async () => {
      setSearchParams({ ...baseLaunchParams, moveOn: 'CompletedAndPassed' });
      setupInitMocks();
      adapter = new CMI5Adapter();
      await adapter.init();
      expect(adapter.getMoveOn()).toBe('CompletedAndPassed');
    });

    it('falls back to NotApplicable for unrecognized moveOn value', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      setSearchParams({ ...baseLaunchParams, moveOn: 'WhateverElse' });
      setupInitMocks();
      adapter = new CMI5Adapter();
      await adapter.init();
      expect(adapter.getMoveOn()).toBe('NotApplicable');
      warn.mockRestore();
    });

    it('attaches masteryscore extension to Completed when launch supplied it', async () => {
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
          try { return JSON.parse(c[1]?.body); } catch { return null; }
        })
        .find((b: any) => b?.verb?.id === 'http://adlnet.gov/expapi/verbs/completed');
      expect(completed).toBeDefined();
      expect(
        completed.context.extensions[
          'https://w3id.org/xapi/cmi5/context/extensions/masteryscore'
        ]
      ).toBe(0.7);
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
          try { return JSON.parse(c[1]?.body); } catch { return null; }
        })
        .find((b: any) => b?.verb?.id === 'http://adlnet.gov/expapi/verbs/failed');
      expect(
        failed.context.extensions[
          'https://w3id.org/xapi/cmi5/context/extensions/masteryscore'
        ]
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
          try { return JSON.parse(c[1]?.body); } catch { return null; }
        })
        .find((b: any) => b?.verb?.id === 'http://adlnet.gov/expapi/verbs/completed');
      const ext = completed?.context?.extensions ?? {};
      expect(
        ext['https://w3id.org/xapi/cmi5/context/extensions/masteryscore']
      ).toBeUndefined();
    });

    it('does not send Satisfied when moveOn is NotApplicable (default)', async () => {
      setupInitMocks();
      adapter = new CMI5Adapter();
      await adapter.init();
      mockFetch.mockClear();
      mockFetch.mockResolvedValue({ ok: true });

      adapter.setScore(95);
      adapter.setSuccessStatus('passed');
      adapter.setCompletionStatus('complete');
      await new Promise((r) => setTimeout(r, 50));

      const verbs = mockFetch.mock.calls
        .map((c: any[]) => { try { return JSON.parse(c[1]?.body)?.verb?.id; } catch { return null; }});
      expect(verbs).not.toContain('https://w3id.org/xapi/adl/verbs/satisfied');
    });

    it('emits Satisfied once when moveOn=Passed and learner passes', async () => {
      setSearchParams({ ...baseLaunchParams, moveOn: 'Passed', masteryScore: '0.7' });
      setupInitMocks();
      adapter = new CMI5Adapter();
      await adapter.init();
      mockFetch.mockClear();
      mockFetch.mockResolvedValue({ ok: true });

      adapter.setScore(90);
      adapter.setDuration(120);
      adapter.setSuccessStatus('passed');
      await new Promise((r) => setTimeout(r, 50));

      const satisfied = mockFetch.mock.calls
        .map((c: any[]) => { try { return JSON.parse(c[1]?.body); } catch { return null; }})
        .filter((b: any) => b?.verb?.id === 'https://w3id.org/xapi/adl/verbs/satisfied');
      expect(satisfied).toHaveLength(1);
      expect(satisfied[0].result.duration).toBe('PT2M');
      expect(
        satisfied[0].context.extensions[
          'https://w3id.org/xapi/cmi5/context/extensions/masteryscore'
        ]
      ).toBe(0.7);
    });

    it('does not emit Satisfied when moveOn=Passed and learner fails', async () => {
      setSearchParams({ ...baseLaunchParams, moveOn: 'Passed' });
      setupInitMocks();
      adapter = new CMI5Adapter();
      await adapter.init();
      mockFetch.mockClear();
      mockFetch.mockResolvedValue({ ok: true });

      adapter.setSuccessStatus('failed');
      await new Promise((r) => setTimeout(r, 50));

      const verbs = mockFetch.mock.calls
        .map((c: any[]) => { try { return JSON.parse(c[1]?.body)?.verb?.id; } catch { return null; }});
      expect(verbs).not.toContain('https://w3id.org/xapi/adl/verbs/satisfied');
    });

    it('emits Satisfied for moveOn=Completed when course completes', async () => {
      setSearchParams({ ...baseLaunchParams, moveOn: 'Completed' });
      setupInitMocks();
      adapter = new CMI5Adapter();
      await adapter.init();
      mockFetch.mockClear();
      mockFetch.mockResolvedValue({ ok: true });

      adapter.setCompletionStatus('complete');
      await new Promise((r) => setTimeout(r, 50));

      const verbs = mockFetch.mock.calls
        .map((c: any[]) => { try { return JSON.parse(c[1]?.body)?.verb?.id; } catch { return null; }});
      expect(verbs).toContain('https://w3id.org/xapi/adl/verbs/satisfied');
    });

    it('moveOn=CompletedAndPassed waits for both before emitting Satisfied', async () => {
      setSearchParams({ ...baseLaunchParams, moveOn: 'CompletedAndPassed' });
      setupInitMocks();
      adapter = new CMI5Adapter();
      await adapter.init();
      mockFetch.mockClear();
      mockFetch.mockResolvedValue({ ok: true });

      adapter.setCompletionStatus('complete');
      await new Promise((r) => setTimeout(r, 30));
      let verbs = mockFetch.mock.calls
        .map((c: any[]) => { try { return JSON.parse(c[1]?.body)?.verb?.id; } catch { return null; }});
      expect(verbs).not.toContain('https://w3id.org/xapi/adl/verbs/satisfied');

      adapter.setScore(80);
      adapter.setSuccessStatus('passed');
      await new Promise((r) => setTimeout(r, 30));
      verbs = mockFetch.mock.calls
        .map((c: any[]) => { try { return JSON.parse(c[1]?.body)?.verb?.id; } catch { return null; }});
      const count = verbs.filter((v: any) => v === 'https://w3id.org/xapi/adl/verbs/satisfied').length;
      expect(count).toBe(1);
    });

    it('moveOn=CompletedOrPassed emits on whichever happens first', async () => {
      setSearchParams({ ...baseLaunchParams, moveOn: 'CompletedOrPassed' });
      setupInitMocks();
      adapter = new CMI5Adapter();
      await adapter.init();
      mockFetch.mockClear();
      mockFetch.mockResolvedValue({ ok: true });

      adapter.setCompletionStatus('complete');
      await new Promise((r) => setTimeout(r, 30));
      let verbs = mockFetch.mock.calls
        .map((c: any[]) => { try { return JSON.parse(c[1]?.body)?.verb?.id; } catch { return null; }});
      const count = verbs.filter((v: any) => v === 'https://w3id.org/xapi/adl/verbs/satisfied').length;
      expect(count).toBe(1);
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
      return cats.map((c: any) => c?.id).filter((id: any) => typeof id === 'string');
    }

    function statementFor(verbId: string): any {
      return mockFetch.mock.calls
        .map((c: any[]) => {
          try { return JSON.parse(c[1]?.body); } catch { return null; }
        })
        .find((b: any) => b?.verb?.id === verbId);
    }

    it('tags Initialized with the cmi5 category', async () => {
      setupInitMocks();
      adapter = new CMI5Adapter();
      await adapter.init();
      const initialized = statementFor('http://adlnet.gov/expapi/verbs/initialized');
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
      const completed = statementFor('http://adlnet.gov/expapi/verbs/completed');
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

    it('tags Suspended and Terminated with the cmi5 category only', async () => {
      setupInitMocks();
      adapter = new CMI5Adapter();
      await adapter.init();
      mockFetch.mockClear();
      mockFetch.mockResolvedValue({ ok: true });
      adapter.terminate();
      await new Promise((r) => setTimeout(r, 50));
      const suspended = statementFor('http://adlnet.gov/expapi/verbs/suspended');
      const terminated = statementFor('http://adlnet.gov/expapi/verbs/terminated');
      expect(categoryIds(suspended)).toEqual([CMI5_CAT]);
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
        true
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
      correct: boolean | null
    ): Promise<any> {
      setupInitMocks();
      adapter = new CMI5Adapter();
      await adapter.init();
      mockFetch.mockClear();
      mockFetch.mockResolvedValue({ ok: true });
      adapter.reportInteraction(questionId, interaction, correct);
      await new Promise((r) => setTimeout(r, 50));
      const statementCalls = mockFetch.mock.calls.filter(
        (c: any[]) => c[0]?.includes('statements')
      );
      expect(statementCalls.length).toBe(1);
      return JSON.parse(statementCalls[0][1].body);
    }

    it('sends xAPI answered statement for choice', async () => {
      const body = await initAndReport(
        'q1',
        { type: 'choice', response: ['a', 'b'], correct: ['a'] },
        false
      );
      expect(body.verb.id).toBe('http://adlnet.gov/expapi/verbs/answered');
      expect(body.object.id).toBe('https://example.com/course/1#q1');
      expect(body.object.definition.type).toBe(
        'http://adlnet.gov/expapi/activities/cmi.interaction'
      );
      expect(body.object.definition.interactionType).toBe('choice');
      expect(body.object.definition.correctResponsesPattern).toEqual(['a']);
      expect(body.result.response).toBe('a[,]b');
      expect(body.result.success).toBe(false);
    });

    it('omits correctResponsesPattern when no correct provided', async () => {
      const body = await initAndReport(
        'q1',
        { type: 'likert', response: 'agree' },
        null
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
          response: [['a', '1'], ['b', '2']],
          correct: [['a', '1'], ['b', '2']],
        },
        true
      );
      expect(body.object.definition.interactionType).toBe('matching');
      expect(body.result.response).toBe('a[.]1[,]b[.]2');
      expect(body.object.definition.correctResponsesPattern).toEqual(['a[.]1[,]b[.]2']);
    });

    it('encodes numeric range with colon delimiter', async () => {
      const body = await initAndReport(
        'n1',
        { type: 'numeric', response: 7, correct: { min: 5, max: 10 } },
        true
      );
      expect(body.result.response).toBe('7');
      expect(body.object.definition.correctResponsesPattern).toEqual(['5[:]10']);
    });
  });
});
