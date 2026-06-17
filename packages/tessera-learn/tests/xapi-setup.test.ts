// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { buildXAPIClient } from '../src/runtime/xapi/setup.js';
import { CMI5Adapter } from '../src/runtime/adapters/cmi5.js';
import { XAPIAdapter } from '../src/runtime/adapters/xapi.js';
import type { CourseConfig } from '../src/runtime/types.js';

const mockFetch = vi.fn();

const baseLaunchParams = {
  fetch: 'https://lms.example.com/fetch-token',
  endpoint: 'https://lms.example.com/xapi/',
  registration: 'reg-xapi-setup',
  activityId: 'https://example.com/course/xapi',
  actor: JSON.stringify({
    mbox: 'mailto:learner@example.com',
    name: 'Learner',
  }),
};

function setSearchParams(params: Record<string, string>) {
  const url = `http://localhost/?${new URLSearchParams(params).toString()}`;
  Object.defineProperty(window, 'location', {
    value: new URL(url),
    writable: true,
    configurable: true,
  });
}

function setupLMSMocks() {
  mockFetch.mockImplementation(async (url: string, _options?: RequestInit) => {
    if (url === baseLaunchParams.fetch) {
      return { ok: true, text: async () => 'lms-auth-token' };
    }
    if (url.includes('activities/state')) {
      return { ok: false, status: 404 };
    }
    if (url.includes('agents/profile')) {
      return { ok: false, status: 404 };
    }
    if (url.includes('statements')) {
      return { ok: true, status: 204 };
    }
    return { ok: false, status: 404 };
  });
}

function baseConfig(): CourseConfig {
  return {
    title: 'Custom xAPI Smoke',
    completion: { mode: 'percentage' },
    scoring: { passingScore: 70 },
    export: { standard: 'cmi5' },
  } as CourseConfig;
}

describe('buildXAPIClient — cmi5 custom xAPI integration', () => {
  let adapter: CMI5Adapter;

  beforeEach(() => {
    mockFetch.mockReset();
    vi.spyOn(globalThis, 'fetch').mockImplementation(mockFetch);
    setSearchParams(baseLaunchParams);
    setupLMSMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fan-outs a useXAPI() sendStatement through the cmi5 publisher (endpoint: 'lms')", async () => {
    adapter = new CMI5Adapter();
    await adapter.init();

    const config = baseConfig();
    config.xapi = { endpoint: 'lms' };
    const client = await buildXAPIClient(config, adapter);
    expect(client).not.toBeNull();

    mockFetch.mockClear();
    mockFetch.mockResolvedValue({ ok: true, status: 204 });

    const result = await client!.sendStatement({
      verb: {
        id: 'http://adlnet.gov/expapi/verbs/experienced',
        display: { 'en-US': 'experienced' },
      },
      object: {
        id: 'https://example.com/course/xapi/note',
        objectType: 'Activity',
      },
    });

    expect(result.destinations).toHaveLength(1);
    expect(result.destinations[0].ok).toBe(true);
    expect(result.destinations[0].endpoint).toBe(baseLaunchParams.endpoint);

    // POST went to the LMS-launch endpoint with the launch auth token.
    const statementCalls = mockFetch.mock.calls.filter(([url]) =>
      String(url).includes('statements'),
    );
    expect(statementCalls.length).toBeGreaterThan(0);
    const [, init] = statementCalls[0];
    const headers = new Headers((init as RequestInit).headers);
    expect(headers.get('Authorization')).toBe('Basic lms-auth-token');
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.actor.mbox).toBe('mailto:learner@example.com');
  });

  it('explicit cmi5 destination inherits the launch actor when xapi.actor is omitted', async () => {
    adapter = new CMI5Adapter();
    await adapter.init();

    const config = baseConfig();
    config.xapi = {
      endpoint: 'https://analytics.example.com/xapi/',
      auth: 'analytics-token',
      activityId: 'https://example.com/course/analytics',
    };

    const client = await buildXAPIClient(config, adapter);
    expect(client).not.toBeNull();
    expect(client!.getActor()).toEqual({
      mbox: 'mailto:learner@example.com',
      name: 'Learner',
    });
  });

  it("mixed destinations: 'lms' + explicit both materialize and fan-out", async () => {
    adapter = new CMI5Adapter();
    await adapter.init();

    const config = baseConfig();
    config.xapi = [
      { endpoint: 'lms' },
      {
        endpoint: 'https://analytics.example.com/xapi/',
        auth: 'analytics-token',
        activityId: 'https://example.com/course/analytics',
      },
    ];

    const client = await buildXAPIClient(config, adapter);
    expect(client).not.toBeNull();

    mockFetch.mockClear();
    mockFetch.mockResolvedValue({ ok: true, status: 204 });

    const result = await client!.sendStatement({
      verb: { id: 'http://adlnet.gov/expapi/verbs/experienced' },
      object: {
        id: 'https://example.com/course/xapi/note',
        objectType: 'Activity',
      },
    });
    expect(result.destinations).toHaveLength(2);
    const endpoints = result.destinations.map((d) => d.endpoint).sort();
    expect(endpoints).toEqual([
      'https://analytics.example.com/xapi/',
      'https://lms.example.com/xapi/',
    ]);
  });

  it("dev fallback: 'lms' under cmi5 with no launch params surfaces a clear error on send", async () => {
    // No launch params → the runtime hands buildXAPIClient `null` (it'd
    // otherwise pass the WebAdapter fallback). Mirror that shape here.
    setSearchParams({});

    const config = baseConfig();
    config.xapi = { endpoint: 'lms' };

    const client = await buildXAPIClient(config, null);
    expect(client).not.toBeNull();

    // sendStatement is Promise.all-fail-fast — the whole call rejects.
    await expect(
      client!.sendStatement(
        { verb: { id: 'http://verb/exp' } },
        { retry: false },
      ),
    ).rejects.toThrow(/no cmi5 launch parameters/);
  });
});

describe('buildXAPIClient — plain xAPI launch integration', () => {
  const xapiLaunch = {
    endpoint: 'https://lrs.example.com/xapi/',
    auth: 'eGFwaS1hdXRo',
    registration: '550e8400-e29b-41d4-a716-446655440000',
    activity_id: 'https://example.com/course/plain-xapi',
    actor: JSON.stringify({
      mbox: 'mailto:plain@example.com',
      name: 'Plain',
    }),
  };

  beforeEach(() => {
    mockFetch.mockReset();
    vi.spyOn(globalThis, 'fetch').mockImplementation(mockFetch);
    setSearchParams(xapiLaunch);
    mockFetch.mockImplementation(async (url: string) => {
      if (String(url).includes('activities/state')) {
        return { ok: false, status: 404 };
      }
      return { ok: true, status: 204 };
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fan-outs a useXAPI() sendStatement through the xAPI launch publisher (endpoint: 'lms')", async () => {
    const adapter = new XAPIAdapter('1.0.3');
    await adapter.init();

    const config = {
      ...baseConfig(),
      export: { standard: 'xapi' },
    } as CourseConfig;
    config.xapi = { endpoint: 'lms' };
    const client = await buildXAPIClient(config, adapter);
    expect(client).not.toBeNull();

    mockFetch.mockClear();
    mockFetch.mockResolvedValue({ ok: true, status: 204 });

    const result = await client!.sendStatement({
      verb: {
        id: 'http://adlnet.gov/expapi/verbs/experienced',
        display: { 'en-US': 'experienced' },
      },
      object: {
        id: 'https://example.com/course/plain-xapi/note',
        objectType: 'Activity',
      },
    });

    expect(result.destinations).toHaveLength(1);
    expect(result.destinations[0].ok).toBe(true);
    expect(result.destinations[0].endpoint).toBe(xapiLaunch.endpoint);

    const statementCalls = mockFetch.mock.calls.filter(([url]) =>
      String(url).includes('statements'),
    );
    expect(statementCalls.length).toBeGreaterThan(0);
    const [, init] = statementCalls[0];
    const headers = new Headers((init as RequestInit).headers);
    expect(headers.get('Authorization')).toBe('Basic eGFwaS1hdXRo');
    expect(headers.get('X-Experience-API-Version')).toBe('1.0.3');
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.actor.mbox).toBe('mailto:plain@example.com');
  });

  it("dev fallback: 'lms' under xapi with no launch params surfaces an xAPI-specific error", async () => {
    setSearchParams({});

    const config = {
      ...baseConfig(),
      export: { standard: 'xapi' },
    } as CourseConfig;
    config.xapi = { endpoint: 'lms' };

    const client = await buildXAPIClient(config, null);
    expect(client).not.toBeNull();

    await expect(
      client!.sendStatement(
        { verb: { id: 'http://verb/exp' } },
        { retry: false },
      ),
    ).rejects.toThrow(
      /xAPI launch parameters \(endpoint \/ actor \/ activity_id\)/,
    );
  });
});
