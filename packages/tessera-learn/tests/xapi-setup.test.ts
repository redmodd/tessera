// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildXAPIClient } from '../src/runtime/xapi/setup.js';
import { CMI5Adapter } from '../src/runtime/adapters/cmi5.js';
import { XAPIAdapter } from '../src/runtime/adapters/xapi.js';
import { WebAdapter } from '../src/runtime/adapters/web.js';
import { SCORM12Adapter } from '../src/runtime/adapters/scorm12.js';
import type { CourseConfig } from '../src/runtime/types.js';
import type { XAPIClient } from '../src/runtime/xapi/client.js';
import {
  CMI5_LAUNCH,
  cmi5Fetch,
  createConfig,
  postedStatements,
  requests,
  respond,
  scorm12Api,
  setLaunchParams,
  setXAPILaunch,
  statementRequests,
} from './helpers.js';

const mockFetch = vi.fn();

const ANALYTICS = 'https://analytics.example.com/';

const sendOnce = (client: XAPIClient) =>
  client.sendStatement({ verb: { id: 'http://verb/exp' } }, { retry: false });

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
    const [[, init]] = statementRequests(mockFetch);
    expect(init.headers.get('Authorization')).toBe('Basic test-auth-token');
    expect(postedStatements(mockFetch)[0].actor.mbox).toBe(
      'mailto:test@example.com',
    );
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
    const [[, init]] = requests(mockFetch, ANALYTICS);
    expect(init.headers.get('Authorization')).toBe('Basic resolved-token');
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
    await expect(sendOnce(client!)).rejects.toThrow(
      /xapi\["analytics"\]\.auth/,
    );
    expect(requests(mockFetch, ANALYTICS)).toHaveLength(0);
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
    await expect(sendOnce(client!)).rejects.toThrow(
      /no cmi5 launch parameters/,
    );
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
    await expect(sendOnce(client!)).rejects.toThrow(
      /no cmi5 launch parameters/,
    );
  });
});

describe('buildXAPIClient — plain xAPI launch integration', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch);
    setXAPILaunch();
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
    expect(result.destinations[0].endpoint).toBe('https://lrs.example/xapi/');

    const [[, init]] = statementRequests(mockFetch);
    expect(init.headers.get('Authorization')).toBe('Basic Zm9vOmJhcg==');
    expect(init.headers.get('X-Experience-API-Version')).toBe('1.0.3');
    expect(postedStatements(mockFetch)[0].actor.account.name).toBe('learner-1');
  });

  it("dev fallback: 'lms' under xapi with no launch params surfaces an xAPI-specific error", async () => {
    setLaunchParams({});

    const config = createConfig({
      export: { standard: 'xapi' },
      xapi: { endpoint: 'lms' },
    });

    const client = await buildXAPIClient(config, new WebAdapter(config));
    expect(client).not.toBeNull();

    await expect(sendOnce(client!)).rejects.toThrow(
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
    await expect(sendOnce(client!)).rejects.toThrow(
      /no SCORM 1.2 API object found/,
    );
  });
});
