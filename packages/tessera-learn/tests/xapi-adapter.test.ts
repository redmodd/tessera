// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { XAPIAdapter } from '../src/runtime/adapters/xapi.js';
import {
  flush,
  noDeadline,
  postedStatements,
  requests,
  respond,
  setLaunchParams,
  setXAPILaunch,
  XAPI_LAUNCH,
} from './helpers.js';

const fetchMock = vi.fn();

const calls = (path: string) => requests(fetchMock, path);

const posted = () => postedStatements(fetchMock);

async function sentActor(actor: unknown) {
  setXAPILaunch({ actor: JSON.stringify(actor) });
  const adapter = new XAPIAdapter();
  await adapter.init();
  adapter.setCompletionStatus('complete');
  await flush();
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

describe('XAPIAdapter.connect', () => {
  it('connects when all params are present', () => {
    setXAPILaunch();
    expect(XAPIAdapter.connect()).toBeInstanceOf(XAPIAdapter);
  });

  it.each(['endpoint', 'auth', 'actor', 'activity_id'] as const)(
    'returns null when %s is missing',
    (param) => {
      const { [param]: _, ...rest } = XAPI_LAUNCH;
      setLaunchParams(rest);
      expect(XAPIAdapter.connect()).toBeNull();
    },
  );

  it('returns null when activity_id is empty', () => {
    setXAPILaunch({ activity_id: '' });
    expect(XAPIAdapter.connect()).toBeNull();
  });

  it('returns null for a cmi5 launch, which names the activity activityId', () => {
    const { activity_id, ...rest } = XAPI_LAUNCH;
    setLaunchParams({ ...rest, activityId: activity_id });
    expect(XAPIAdapter.connect()).toBeNull();
  });
});

describe('XAPIAdapter', () => {
  beforeEach(() => {
    fetchMock.mockImplementation(async () => respond(404));
    vi.stubGlobal('fetch', fetchMock);
  });

  it('parses snake_case Tin Can launch params and sends the version header', async () => {
    setXAPILaunch({ registration: '2d8b1e1e-0000-4000-8000-000000000000' });
    const adapter = new XAPIAdapter();
    await adapter.init();
    adapter.setCompletionStatus('complete');
    await flush();
    const [send] = calls('/statements');
    expect(send).toBeTruthy();
    const headers = send[1].headers as Headers;
    expect(headers.get('X-Experience-API-Version')).toBe('1.0.3');
    expect(headers.get('Authorization')).toBe('Basic Zm9vOmJhcg==');
  });

  it('reshapes an array-shaped launch actor into an Agent', async () => {
    setXAPILaunch({
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
    await flush();
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
    setXAPILaunch({ actor: JSON.stringify({ name: 'Learner Name' }) });
    const adapter = new XAPIAdapter();
    await expect(adapter.init()).rejects.toThrow(/actor/);
    adapter.setCompletionStatus('complete');
    await flush();
    expect(calls('/statements')).toHaveLength(0);
  });

  it('throws on malformed actor JSON', async () => {
    setXAPILaunch({ actor: 'not-json' });
    await expect(new XAPIAdapter().init()).rejects.toThrow(/actor/);
  });

  it('rejects a launch actor left with no IFI, blaming the launch param', async () => {
    setXAPILaunch({
      actor: JSON.stringify({ objectType: 'Person', name: ['Learner Name'] }),
    });
    await expect(new XAPIAdapter().init()).rejects.toThrow(
      /launch parameter 'actor' is malformed \(actor: must have one of mbox/,
    );
    expect(calls('/xapi')).toHaveLength(0);
  });

  it('rejects a relative endpoint before any request', async () => {
    setXAPILaunch({ endpoint: '/lrs' });
    await expect(new XAPIAdapter().init()).rejects.toThrow(
      /launch parameter 'endpoint' is not an absolute http\(s\) URL/,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(['Basic ', 'Basic'])(
    'rejects an auth param of %j, which carries only the scheme, before any request',
    async (auth) => {
      setXAPILaunch({ auth });
      await expect(XAPIAdapter.connect()!.init()).rejects.toThrow(
        /launch parameter 'auth' must be a non-empty string/,
      );
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it('stops State API writes after the actor fails validation', async () => {
    setXAPILaunch({ actor: JSON.stringify({ name: 'Learner Name' }) });
    const adapter = new XAPIAdapter();
    await expect(adapter.init()).rejects.toThrow(/actor/);
    adapter.saveState({ page: 1 } as never);
    await flush();
    expect(calls('activities/state')).toHaveLength(0);
  });

  it('sends a scored statement when the score changes without a Passed/Failed', async () => {
    setXAPILaunch();
    const adapter = new XAPIAdapter();
    await adapter.init();
    await flush();
    fetchMock.mockClear();

    adapter.setScore(50);
    adapter.setSuccessStatus('failed');
    adapter.commit();
    await flush();

    adapter.setScore(53.3);
    adapter.setSuccessStatus('failed');
    adapter.setDuration(120);
    adapter.commit();
    await flush();

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
    setXAPILaunch();
    const adapter = new XAPIAdapter();
    await adapter.init();
    await flush();
    fetchMock.mockClear();
    adapter.seedLifecycle('incomplete', 'failed', 60);

    adapter.setScore(60);
    adapter.setSuccessStatus('failed');
    adapter.commit();
    await flush();

    expect(posted()).toHaveLength(0);
  });

  it('exit sends Terminated and stays on the page', async () => {
    setXAPILaunch();
    const adapter = new XAPIAdapter();
    await adapter.init();
    await flush();

    await adapter.exit(noDeadline);
    expect(posted().map((s) => s.verb.id)).toContain(
      'http://adlnet.gov/expapi/verbs/terminated',
    );
    expect(adapter.returnToLMS()).toBe(false);
  });
});
