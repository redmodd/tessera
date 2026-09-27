// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { XAPIAdapter } from '../src/runtime/adapters/xapi.js';
import { setLaunchParams, tick } from './helpers.js';

const ACTOR = {
  objectType: 'Agent',
  account: { homePage: 'https://lms', name: 'learner-1' },
};

const fetchMock = vi.fn();

function launch(params: Record<string, string>) {
  setLaunchParams({
    endpoint: 'https://lrs.example/xapi',
    // Tin Can launch sends the full "Basic <base64>" header value; the adapter
    // must strip the scheme so it doesn't double-prefix on the wire.
    auth: 'Basic Zm9vOmJhcg==',
    activity_id: 'urn:tessera:au:abc',
    ...params,
  });
}

function calls(path: string) {
  return fetchMock.mock.calls.filter(([u]) => String(u).includes(path));
}

function posted(): any[] {
  return calls('/statements')
    .filter(([, o]) => o?.method === 'POST')
    .map(([, o]) => JSON.parse(o.body));
}

async function sentActor(actor: unknown) {
  launch({ actor: JSON.stringify(actor) });
  const adapter = new XAPIAdapter();
  await adapter.init();
  adapter.setCompletionStatus('complete');
  await tick();
  return posted()[0].actor;
}

const ACCOUNT = {
  homePage: 'http://cloud.scorm.com',
  name: 'APPID|learner@example.com',
};
const TIN_CAN_ACCOUNT = [
  {
    accountServiceHomePage: ACCOUNT.homePage,
    accountName: ACCOUNT.name,
  },
];

describe('XAPIAdapter', () => {
  beforeEach(() => {
    fetchMock.mockImplementation(
      async () => new Response('{}', { status: 404 }),
    );
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    window.history.replaceState({}, '', '/');
  });

  it('parses snake_case Tin Can launch params and sends the version header', async () => {
    launch({
      actor: JSON.stringify(ACTOR),
      registration: '2d8b1e1e-0000-4000-8000-000000000000',
    });
    const adapter = new XAPIAdapter();
    await adapter.init();
    adapter.setCompletionStatus('complete');
    await tick();
    const [send] = calls('/statements');
    expect(send).toBeTruthy();
    const headers = send[1].headers as Headers;
    expect(headers.get('X-Experience-API-Version')).toBe('1.0.3');
    expect(headers.get('Authorization')).toBe('Basic Zm9vOmJhcg==');
  });

  it('reshapes an array-shaped launch actor into an Agent', async () => {
    launch({
      actor: JSON.stringify({
        name: ['Learner Name'],
        account: TIN_CAN_ACCOUNT,
        objectType: 'Agent',
      }),
    });
    const adapter = new XAPIAdapter();
    await adapter.init();
    await adapter.loadState();
    adapter.setCompletionStatus('complete');
    await tick();
    expect(posted()[0].actor).toEqual({
      name: 'Learner Name',
      account: ACCOUNT,
      objectType: 'Agent',
    });
    const [[stateUrl]] = calls('activities/state');
    expect(String(stateUrl)).toContain(encodeURIComponent('"homePage"'));
  });

  it.each([
    [
      'reshapes a Person with several IFIs down to its account',
      {
        objectType: 'Person',
        name: ['Learner Name'],
        mbox: ['mailto:learner@example.com'],
        account: TIN_CAN_ACCOUNT,
      },
      { objectType: 'Agent', name: 'Learner Name', account: ACCOUNT },
    ],
    [
      'keeps the account when a Person-shaped actor is labelled Agent',
      {
        objectType: 'Agent',
        name: ['Learner Name'],
        mbox: ['mailto:learner@example.com'],
        account: TIN_CAN_ACCOUNT,
      },
      { objectType: 'Agent', name: 'Learner Name', account: ACCOUNT },
    ],
    [
      'normalizes a member-less Group launch actor to an Agent',
      { objectType: 'Group', name: 'Learner Name', account: ACCOUNT },
      { objectType: 'Agent', name: 'Learner Name', account: ACCOUNT },
    ],
    [
      'maps account key aliases on an unwrapped account object',
      {
        objectType: 'Agent',
        name: 'Learner Name',
        account: TIN_CAN_ACCOUNT[0],
      },
      { objectType: 'Agent', name: 'Learner Name', account: ACCOUNT },
    ],
    [
      'falls through to the mbox_sha1sum when the mbox has no mailto: scheme',
      {
        objectType: 'Person',
        mbox: ['learner@example.com'],
        mbox_sha1sum: ['a'.repeat(40)],
      },
      { objectType: 'Agent', mbox_sha1sum: 'a'.repeat(40) },
    ],
    [
      'drops a non-string name',
      {
        objectType: 'Person',
        name: [{ given: 'Jo' }],
        account: [{ accountServiceHomePage: 'http://lms', accountName: 'l1' }],
      },
      { objectType: 'Agent', account: { homePage: 'http://lms', name: 'l1' } },
    ],
    [
      'falls through to the mbox when the account has no homePage',
      {
        objectType: 'Person',
        name: ['Learner Name'],
        mbox: ['mailto:learner@example.com'],
        account: [{ accountName: 'APPID|learner@example.com' }],
      },
      {
        objectType: 'Agent',
        name: 'Learner Name',
        mbox: 'mailto:learner@example.com',
      },
    ],
    [
      'falls through to the mbox when the account is null',
      { account: null, mbox: 'mailto:learner@example.com' },
      { mbox: 'mailto:learner@example.com' },
    ],
    [
      'falls through to the mbox when the account homePage is not a URL',
      {
        objectType: 'Person',
        mbox: ['mailto:learner@example.com'],
        account: [{ accountServiceHomePage: '/lms', accountName: 'learner' }],
      },
      { objectType: 'Agent', mbox: 'mailto:learner@example.com' },
    ],
    [
      'drops keys the LMS invented, including a non-array member',
      {
        objectType: 'Group',
        member: { mbox: 'mailto:other@example.com' },
        mbox: 'mailto:learner@example.com',
        lmsUserId: 42,
      },
      { objectType: 'Agent', mbox: 'mailto:learner@example.com' },
    ],
    [
      'drops an empty member array instead of reading it as a Group',
      {
        objectType: 'Group',
        member: [],
        account: { homePage: 'http://cloud.scorm.com', name: 'APPID|l' },
      },
      {
        objectType: 'Agent',
        account: { homePage: 'http://cloud.scorm.com', name: 'APPID|l' },
      },
    ],
  ])('%s', async (_, actor, expected) => {
    expect(await sentActor(actor)).toEqual(expected);
  });

  it('sends nothing after init rejects an actor it cannot reshape', async () => {
    launch({ actor: JSON.stringify({ name: 'Learner Name' }) });
    const adapter = new XAPIAdapter();
    await expect(adapter.init()).rejects.toThrow(/actor/);
    adapter.setCompletionStatus('complete');
    await tick();
    expect(calls('/statements')).toHaveLength(0);
  });

  it('throws on malformed actor JSON', async () => {
    launch({ actor: 'not-json' });
    await expect(new XAPIAdapter().init()).rejects.toThrow(/actor/);
  });

  it('rejects a launch actor left with no IFI, blaming the launch param', async () => {
    launch({
      actor: JSON.stringify({ objectType: 'Person', name: ['Learner Name'] }),
    });
    await expect(new XAPIAdapter().init()).rejects.toThrow(
      /launch parameter 'actor' is malformed \(actor: must have one of mbox/,
    );
    expect(calls('/xapi')).toHaveLength(0);
  });

  it('stops State API writes after the actor fails validation', async () => {
    launch({ actor: JSON.stringify({ name: 'Learner Name' }) });
    const adapter = new XAPIAdapter();
    await expect(adapter.init()).rejects.toThrow(/actor/);
    adapter.saveState({ page: 1 } as never);
    await tick();
    expect(calls('activities/state')).toHaveLength(0);
  });

  it('sends a scored statement when the score changes without a Passed/Failed', async () => {
    launch({ actor: JSON.stringify(ACTOR) });
    const adapter = new XAPIAdapter();
    await adapter.init();
    await tick();
    fetchMock.mockClear();

    adapter.setScore(50);
    adapter.setSuccessStatus('failed');
    adapter.commit();
    await tick();

    adapter.setScore(53.3);
    adapter.setSuccessStatus('failed');
    adapter.setDuration(120);
    adapter.commit();
    await tick();

    const bodies = posted();
    expect(bodies.map((b) => b.verb.id)).toEqual([
      'http://adlnet.gov/expapi/verbs/failed',
      'http://adlnet.gov/expapi/verbs/scored',
    ]);
    expect(bodies[0].result.score.scaled).toBe(0.5);
    expect(bodies[1].result.score.scaled).toBe(0.533);
    expect(bodies[1].result.duration).toBe('PT2M');
  });

  it('does not re-send the resumed score on launch', async () => {
    launch({ actor: JSON.stringify(ACTOR) });
    const adapter = new XAPIAdapter();
    await adapter.init();
    await tick();
    fetchMock.mockClear();
    adapter.seedLifecycle('incomplete', 'failed', 60);

    adapter.setScore(60);
    adapter.setSuccessStatus('failed');
    adapter.commit();
    await tick();

    expect(posted()).toHaveLength(0);
  });
});
