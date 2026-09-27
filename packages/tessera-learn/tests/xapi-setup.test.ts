// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildXAPIClient } from '../src/runtime/xapi/setup.js';
import { CMI5Adapter } from '../src/runtime/adapters/cmi5.js';
import { XAPIAdapter } from '../src/runtime/adapters/xapi.js';
import { WebAdapter } from '../src/runtime/adapters/web.js';
import { SCORM12Adapter } from '../src/runtime/adapters/scorm12.js';
import type { CourseConfig } from '../src/runtime/types.js';
import {
  CMI5_LAUNCH,
  cmi5Fetch,
  createConfig,
  respond,
  scorm12Api,
  setLaunchParams,
  statementRequests,
} from './helpers.js';

const mockFetch = vi.fn();

function cmi5Config(xapi: CourseConfig['xapi']): CourseConfig {
  return createConfig({ export: { standard: 'cmi5' }, xapi });
}

async function initCMI5Adapter() {
  const adapter = new CMI5Adapter();
  await adapter.init();
  return adapter;
}

describe('buildXAPIClient — cmi5 custom xAPI integration', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch);
    setLaunchParams(CMI5_LAUNCH);
    mockFetch.mockImplementation(cmi5Fetch());
  });

  it("fan-outs a useXAPI() sendStatement through the cmi5 publisher (endpoint: 'lms')", async () => {
    const adapter = await initCMI5Adapter();

    const config = cmi5Config({ endpoint: 'lms' });
    const client = await buildXAPIClient(config, adapter);
    expect(client).not.toBeNull();

    mockFetch.mockClear();

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
    expect(result.destinations[0].endpoint).toBe(CMI5_LAUNCH.endpoint);

    // POST went to the LMS-launch endpoint with the launch auth token.
    const statementCalls = statementRequests(mockFetch);
    expect(statementCalls.length).toBeGreaterThan(0);
    const [, init] = statementCalls[0];
    const headers = new Headers((init as RequestInit).headers);
    expect(headers.get('Authorization')).toBe('Basic test-auth-token');
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.actor.mbox).toBe('mailto:test@example.com');
  });

  it('explicit cmi5 destination inherits the launch actor when xapi.actor is omitted', async () => {
    const adapter = await initCMI5Adapter();

    const config = cmi5Config({
      id: 'analytics',
      endpoint: 'https://analytics.example.com/xapi/',
      auth: 'analytics-token',
      activityId: 'https://example.com/course/analytics',
    });

    const client = await buildXAPIClient(config, adapter);
    expect(client).not.toBeNull();
    expect(client!.getActor()).toEqual({
      mbox: 'mailto:test@example.com',
      name: 'Test User',
    });
  });

  it('explicit destination takes auth and actor resolvers from course.runtime.js by id', async () => {
    const adapter = await initCMI5Adapter();

    const config = cmi5Config({
      id: 'analytics',
      endpoint: 'https://analytics.example.com/xapi/',
      activityId: 'https://example.com/course/analytics',
    });

    const client = await buildXAPIClient(config, adapter, {
      analytics: {
        auth: async () => 'resolved-token',
        actor: async () => ({ mbox: 'mailto:resolved@example.com' }),
      },
    });
    expect(client!.getActor()).toEqual({ mbox: 'mailto:resolved@example.com' });

    mockFetch.mockClear();
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
    const adapter = await initCMI5Adapter();

    const config = cmi5Config({
      id: 'analytics',
      endpoint: 'https://analytics.example.com/xapi/',
      activityId: 'https://example.com/course/analytics',
    });

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
    const adapter = await initCMI5Adapter();

    const config = cmi5Config([
      { endpoint: 'lms' },
      {
        id: 'analytics',
        endpoint: 'https://analytics.example.com/xapi/',
        auth: 'analytics-token',
        activityId: 'https://example.com/course/analytics',
      },
    ]);

    const client = await buildXAPIClient(config, adapter);
    expect(client).not.toBeNull();

    mockFetch.mockClear();

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
    const adapter = await initCMI5Adapter();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const config = cmi5Config([
      { endpoint: 'lms' },
      {
        id: 'analytics',
        endpoint: 'ftp://analytics.example.com/xapi/',
        auth: 'analytics-token',
        activityId: 'https://example.com/course/analytics',
      },
    ]);

    const client = await buildXAPIClient(config, adapter);
    expect(warn).toHaveBeenCalledWith(
      expect.stringMatching(/failed to initialize a destination/),
      expect.any(Error),
    );

    mockFetch.mockClear();
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
    setLaunchParams({});

    const config = cmi5Config({ endpoint: 'lms' });

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
    setLaunchParams({});

    const config = cmi5Config({
      id: 'analytics',
      endpoint: 'https://analytics.example.com/xapi/',
      auth: 'analytics-token',
      activityId: 'https://example.com/course/analytics',
    });

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
    vi.stubGlobal('fetch', mockFetch);
    setLaunchParams(xapiLaunch);
    mockFetch.mockImplementation(async (url: string) => {
      if (String(url).includes('activities/state')) {
        return respond(404);
      }
      return respond(204);
    });
  });

  it("fan-outs a useXAPI() sendStatement through the xAPI launch publisher (endpoint: 'lms')", async () => {
    const adapter = new XAPIAdapter();
    await adapter.init();

    const config = createConfig({
      export: { standard: 'xapi' },
      xapi: { endpoint: 'lms' },
    });
    const client = await buildXAPIClient(config, adapter);
    expect(client).not.toBeNull();

    mockFetch.mockClear();

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

    const statementCalls = statementRequests(mockFetch);
    expect(statementCalls.length).toBeGreaterThan(0);
    const [, init] = statementCalls[0];
    const headers = new Headers((init as RequestInit).headers);
    expect(headers.get('Authorization')).toBe('Basic eGFwaS1hdXRo');
    expect(headers.get('X-Experience-API-Version')).toBe('1.0.3');
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.actor.mbox).toBe('mailto:plain@example.com');
  });

  it("dev fallback: 'lms' under xapi with no launch params surfaces an xAPI-specific error", async () => {
    setLaunchParams({});

    const config = createConfig({
      export: { standard: 'xapi' },
      xapi: { endpoint: 'lms' },
    });

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
    return createConfig({ export: { standard: 'scorm12' }, xapi: explicit });
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
