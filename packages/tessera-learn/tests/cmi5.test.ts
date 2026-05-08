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
