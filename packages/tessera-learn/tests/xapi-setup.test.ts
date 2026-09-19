// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { buildXAPIClient } from '../src/runtime/xapi/setup.js';
import { CMI5Adapter } from '../src/runtime/adapters/cmi5.js';
import { XAPIAdapter } from '../src/runtime/adapters/xapi.js';
import { WebAdapter } from '../src/runtime/adapters/web.js';
import { SCORM12Adapter } from '../src/runtime/adapters/scorm12.js';
import type { CourseConfig } from '../src/runtime/types.js';
import { scorm12Api } from './helpers.js';

const mockFetch = vi.fn();

afterEach(() => {
  vi.restoreAllMocks();
});

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
      id: 'analytics',
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

  it('explicit destination takes auth and actor resolvers from course.runtime.js by id', async () => {
    adapter = new CMI5Adapter();
    await adapter.init();

    const config = baseConfig();
    config.xapi = {
      id: 'analytics',
      endpoint: 'https://analytics.example.com/xapi/',
      activityId: 'https://example.com/course/analytics',
    };

    const client = await buildXAPIClient(config, adapter, {
      analytics: {
        auth: async () => 'resolved-token',
        actor: async () => ({ mbox: 'mailto:resolved@example.com' }),
      },
    });
    expect(client!.getActor()).toEqual({ mbox: 'mailto:resolved@example.com' });

    mockFetch.mockClear();
    mockFetch.mockResolvedValue({ ok: true, status: 204 });
    await client!.sendStatement({
      verb: { id: 'http://adlnet.gov/expapi/verbs/experienced' },
    });
    const send = mockFetch.mock.calls.find(([url]) =>
      String(url).startsWith('https://analytics.example.com/'),
    );
    expect((send![1].headers as Headers).get('Authorization')).toBe(
      'Basic resolved-token',
    );
  });

  it('explicit destination with auth in neither file rejects sends instead of going unauthenticated', async () => {
    adapter = new CMI5Adapter();
    await adapter.init();

    const config = baseConfig();
    config.xapi = {
      id: 'analytics',
      endpoint: 'https://analytics.example.com/xapi/',
      activityId: 'https://example.com/course/analytics',
    };

    const client = await buildXAPIClient(config, adapter, {
      other: { auth: async () => 'resolved-token' },
    });
    expect(client).not.toBeNull();

    mockFetch.mockClear();
    await expect(
      client!.sendStatement(
        { verb: { id: 'http://verb/exp' } },
        { retry: false },
      ),
    ).rejects.toThrow(/xapi\["analytics"\]\.auth/);
    expect(
      mockFetch.mock.calls.some(([url]) =>
        String(url).startsWith('https://analytics.example.com/'),
      ),
    ).toBe(false);
  });

  it("mixed destinations: 'lms' + explicit both materialize and fan-out", async () => {
    adapter = new CMI5Adapter();
    await adapter.init();

    const config = baseConfig();
    config.xapi = [
      { endpoint: 'lms' },
      {
        id: 'analytics',
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

  it('skips a destination the publisher rejects without dropping the others', async () => {
    adapter = new CMI5Adapter();
    await adapter.init();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const config = baseConfig();
    config.xapi = [
      { endpoint: 'lms' },
      {
        id: 'analytics',
        endpoint: 'ftp://analytics.example.com/xapi/',
        auth: 'analytics-token',
        activityId: 'https://example.com/course/analytics',
      },
    ];

    const client = await buildXAPIClient(config, adapter);
    expect(warn).toHaveBeenCalledWith(
      expect.stringMatching(/failed to initialize a destination/),
      expect.any(Error),
    );

    mockFetch.mockClear();
    mockFetch.mockResolvedValue({ ok: true, status: 204 });
    const result = await client!.sendStatement({
      verb: { id: 'http://adlnet.gov/expapi/verbs/experienced' },
      object: {
        id: 'https://example.com/course/xapi/note',
        objectType: 'Activity',
      },
    });
    expect(result.destinations.map((d) => d.endpoint)).toEqual([
      'https://lms.example.com/xapi/',
    ]);
  });

  it("dev fallback: 'lms' under cmi5 with no launch params surfaces a clear error on send", async () => {
    // No launch params: createAdapter's dev fallback is a WebAdapter.
    setSearchParams({});

    const config = baseConfig();
    config.xapi = { endpoint: 'lms' };

    const client = await buildXAPIClient(config, new WebAdapter(config));
    expect(client).not.toBeNull();

    // sendStatement is Promise.all-fail-fast — the whole call rejects.
    await expect(
      client!.sendStatement(
        { verb: { id: 'http://verb/exp' } },
        { retry: false },
      ),
    ).rejects.toThrow(/no cmi5 launch parameters/);
  });

  it('dev fallback: an explicit destination with no actor under cmi5 rejects sends', async () => {
    setSearchParams({});

    const config = baseConfig();
    config.xapi = {
      id: 'analytics',
      endpoint: 'https://analytics.example.com/xapi/',
      auth: 'analytics-token',
      activityId: 'https://example.com/course/analytics',
    };

    const client = await buildXAPIClient(config, new WebAdapter(config));
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

  it("fan-outs a useXAPI() sendStatement through the xAPI launch publisher (endpoint: 'lms')", async () => {
    const adapter = new XAPIAdapter();
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

    const client = await buildXAPIClient(config, new WebAdapter(config));
    expect(client).not.toBeNull();

    await expect(
      client!.sendStatement(
        { verb: { id: 'http://verb/exp' } },
        { retry: false },
      ),
    ).rejects.toThrow(
      /xAPI launch parameters \(endpoint \/ auth \/ actor \/ activity_id\)/,
    );
  });
});

describe('buildXAPIClient — SCORM explicit destination', () => {
  const explicit = {
    id: 'analytics',
    endpoint: 'https://analytics.example.com/xapi/',
    auth: 'analytics-token',
    activityId: 'https://example.com/course/analytics',
  };

  function scormConfig(): CourseConfig {
    return {
      ...baseConfig(),
      export: { standard: 'scorm12' },
      xapi: explicit,
    } as CourseConfig;
  }

  it('derives the actor from the connected LMS', async () => {
    const client = await buildXAPIClient(
      scormConfig(),
      new SCORM12Adapter(scorm12Api({ 'cmi.core.student_id': 'learner-7' })),
    );
    expect(client!.getActor()).toEqual({
      account: { homePage: 'https://example.com', name: 'learner-7' },
      objectType: 'Agent',
    });
  });

  it('skips the destination with a warning when the LMS has no learner id', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(
      await buildXAPIClient(scormConfig(), new SCORM12Adapter(scorm12Api())),
    ).toBeNull();
    expect(warn).toHaveBeenCalledWith(
      expect.stringMatching(/"analytics" has no actor/),
    );
  });

  it('dev fallback: rejects sends because no SCORM API was found', async () => {
    const config = scormConfig();
    const client = await buildXAPIClient(config, new WebAdapter(config));
    await expect(
      client!.sendStatement(
        { verb: { id: 'http://verb/exp' } },
        { retry: false },
      ),
    ).rejects.toThrow(/no SCORM 1.2 API object found/);
  });
});
