// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { CMI5Adapter } from '../src/runtime/adapters/cmi5.js';
import type { SavedState } from '../src/runtime/persistence.js';
import { RETRY_ATTEMPTS } from '../src/runtime/adapters/retry.js';
import {
  CMI5_LAUNCH,
  cmi5Fetch,
  flush,
  noDeadline,
  postedStatements,
  requests,
  respond,
  setLaunchParams,
  statementRequests,
} from './helpers.js';

const mockFetch = vi.fn();

const VERB = 'http://adlnet.gov/expapi/verbs/';
const SESSION_ID_EXT =
  'https://w3id.org/xapi/cmi5/context/extensions/sessionid';
const MASTERY_EXT =
  'https://w3id.org/xapi/cmi5/context/extensions/masteryscore';
const CMI5_CAT = 'https://w3id.org/xapi/cmi5/context/categories/cmi5';
const MOVEON_CAT = 'https://w3id.org/xapi/cmi5/context/categories/moveon';

const sentStatements = () => postedStatements(mockFetch);

const stateWrites = () => requests(mockFetch, 'activities/state', 'PUT');

const statementFor = (verb: string): any =>
  sentStatements().find((b: any) => b?.verb?.id === `${VERB}${verb}`);

const sentVerbs = (): string[] =>
  sentStatements().map((b: any) => b?.verb?.id?.replace(VERB, ''));

function isRunningStateGet(url: string, options?: RequestInit): boolean {
  return (
    url.includes('activities/state') &&
    !url.includes('tessera-state-exit') &&
    (!options || options.method === 'GET')
  );
}

describe('CMI5Adapter.connect', () => {
  it('connects when all params are present', () => {
    setLaunchParams(CMI5_LAUNCH);
    expect(CMI5Adapter.connect()).toBeInstanceOf(CMI5Adapter);
  });

  it.each(['fetch', 'endpoint', 'activityId', 'actor'] as const)(
    'returns null when %s is missing',
    (param) => {
      const { [param]: _, ...rest } = CMI5_LAUNCH;
      setLaunchParams(rest);
      expect(CMI5Adapter.connect()).toBeNull();
    },
  );

  it('returns null with empty search', () => {
    setLaunchParams();
    expect(CMI5Adapter.connect()).toBeNull();
  });
});

describe('CMI5Adapter', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch);
    setLaunchParams(CMI5_LAUNCH);
  });

  async function initAdapter(lms: Parameters<typeof cmi5Fetch>[0] = {}) {
    mockFetch.mockImplementation(cmi5Fetch(lms));
    const adapter = new CMI5Adapter();
    await adapter.init();
    return adapter;
  }

  function stubLocationAssign() {
    const assign = vi.fn();
    vi.stubGlobal('window', {
      ...globalThis.window,
      location: { ...globalThis.window.location, assign },
    });
    return assign;
  }

  function routeResumeGet(resumeGet: Mock<() => Promise<Response>>): void {
    const lms = cmi5Fetch();
    mockFetch.mockImplementation((url: string, init?: RequestInit) =>
      isRunningStateGet(url, init) ? resumeGet() : lms(url, init),
    );
  }

  it('fetches auth token on init', async () => {
    await initAdapter();
    expect(mockFetch).toHaveBeenCalledWith(
      CMI5_LAUNCH.fetch,
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('sends Initialized statement on init', async () => {
    await initAdapter();
    expect(sentVerbs()[0]).toBe('initialized');
  });

  it('does not fetch resume state during init', async () => {
    const adapter = await initAdapter({
      saved: { b: 3, v: [0, 1, 2, 3], d: 100 },
    });
    expect(requests(mockFetch, 'stateId=tessera-state', 'GET')).toHaveLength(0);
    expect(adapter.getState()).toBeNull();

    await adapter.loadState();
    expect(adapter.getState()).toEqual({
      b: 3,
      v: [0, 1, 2, 3],
      d: 100,
    });
  });

  it('retries a transient resume GET failure and restores on success', async () => {
    const saved: SavedState = { b: 2, v: [0, 1, 2], d: 5 };
    const adapter = await initAdapter();

    const resumeGet = vi
      .fn<() => Promise<Response>>()
      .mockRejectedValueOnce(new Error('transient'))
      .mockResolvedValueOnce(respond(503))
      .mockResolvedValueOnce(Response.json(saved));
    routeResumeGet(resumeGet);
    await adapter.loadState();

    expect(resumeGet).toHaveBeenCalledTimes(3);
    expect(adapter.getState()).toEqual(saved);

    mockFetch.mockClear();
    adapter.saveState({ b: 3, v: [0, 1, 2, 3], d: 9 });
    await flush();
    expect(stateWrites()).toHaveLength(1);
  });

  it('does not retry a 404, which is a definitive empty answer', async () => {
    const adapter = await initAdapter();

    const resumeGet = vi.fn(async () => respond(404));
    routeResumeGet(resumeGet);
    await adapter.loadState();
    expect(resumeGet).toHaveBeenCalledTimes(1);
  });

  it('treats an empty 2xx body as no state, leaving saving enabled', async () => {
    const adapter = await initAdapter();

    const resumeGet = vi.fn(async () => respond(204));
    routeResumeGet(resumeGet);
    await adapter.loadState();

    expect(resumeGet).toHaveBeenCalledTimes(1);
    expect(adapter.getState()).toBeNull();

    mockFetch.mockClear();
    adapter.saveState({ b: 1, v: [0, 1], d: 4 });
    await flush();
    expect(stateWrites()).toHaveLength(1);
  });

  it('refuses to save after a failed resume GET, so it cannot clobber', async () => {
    const adapter = await initAdapter();
    const resumeGet = vi.fn(async (): Promise<Response> => {
      throw new Error('network down');
    });
    routeResumeGet(resumeGet);
    await adapter.loadState();
    expect(adapter.getState()).toBeNull();
    expect(resumeGet).toHaveBeenCalledTimes(RETRY_ATTEMPTS);

    mockFetch.mockClear();
    adapter.saveState({ b: 0, v: [0], d: 1 });
    await flush();
    expect(stateWrites()).toHaveLength(0);
  });

  it('still saves when the resume GET legitimately 404s', async () => {
    const adapter = await initAdapter();
    await adapter.loadState();
    expect(adapter.getState()).toBeNull();

    mockFetch.mockClear();
    adapter.saveState({ b: 0, v: [0], d: 1 });
    await flush();
    expect(stateWrites()).toHaveLength(1);
  });

  it('overwrites an unparseable saved document instead of locking saves out', async () => {
    const adapter = await initAdapter();
    const resumeGet = vi.fn(async () => new Response('not json{{{'));
    routeResumeGet(resumeGet);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await adapter.loadState();

    // Re-reading identical bytes can't change the answer, so one attempt only.
    expect(resumeGet).toHaveBeenCalledTimes(1);
    expect(adapter.getState()).toBeNull();

    mockFetch.mockClear();
    adapter.saveState({ b: 0, v: [0], d: 1 });
    await flush();
    expect(stateWrites()).toHaveLength(1);
  });

  it('restores state from xAPI State API', async () => {
    const saved: SavedState = {
      b: 3,
      v: [0, 1, 2, 3],
      g: { '2': { s: 80 } },
      d: 100,
    };
    const adapter = await initAdapter({ saved });
    await adapter.loadState();
    expect(adapter.getState()).toEqual(saved);
  });

  it('returns null state when no saved state', async () => {
    const adapter = await initAdapter();
    await adapter.loadState();
    expect(adapter.getState()).toBeNull();
  });

  it('saves state via PUT to State API', async () => {
    const adapter = await initAdapter();

    mockFetch.mockClear();

    const state: SavedState = { b: 5, v: [0, 1, 2], d: 200 };
    adapter.saveState(state);

    // Allow fire-and-forget PUT to settle
    await flush();

    const puts = stateWrites();
    expect(puts).toHaveLength(1);
    expect(JSON.parse(puts[0][1].body)).toEqual({ ...state, n: 1 });
  });

  it('sends Completed statement when completion is set to complete', async () => {
    const adapter = await initAdapter();

    mockFetch.mockClear();

    adapter.setScore(85);
    adapter.setDuration(3600);
    adapter.setCompletionStatus('complete');

    await flush();

    const [body] = sentStatements();
    expect(body.verb.id).toBe(`${VERB}completed`);
    expect(body.result.completion).toBe(true);
    // cmi5 §9.5.1: Completed MUST NOT include `score`. The score (when
    // present) belongs on Passed/Failed only.
    expect(body.result.score).toBeUndefined();
  });

  it('does not send Completed when status is incomplete', async () => {
    const adapter = await initAdapter();

    mockFetch.mockClear();

    adapter.setCompletionStatus('incomplete');

    await flush();

    expect(statementRequests(mockFetch)).toHaveLength(0);
  });

  it('sends Passed statement on success', async () => {
    const adapter = await initAdapter();

    mockFetch.mockClear();

    adapter.setScore(90);
    adapter.setDuration(1800);
    adapter.setSuccessStatus('passed');

    await flush();

    const [body] = sentStatements();
    expect(body.verb.id).toBe(`${VERB}passed`);
    expect(body.result.success).toBe(true);
    expect(body.result.score.scaled).toBe(0.9);
  });

  it('sends Failed statement on failure', async () => {
    const adapter = await initAdapter();

    mockFetch.mockClear();

    adapter.setScore(40);
    adapter.setSuccessStatus('failed');
    adapter.terminate();

    await flush();

    expect(statementFor('failed').result.success).toBe(false);
    const ids = sentVerbs();
    expect(ids.indexOf('failed')).toBeLessThan(ids.indexOf('terminated'));
  });

  it('holds a resumed failure for its own Terminated, since the last session may have ended without one', async () => {
    const adapter = await initAdapter();

    adapter.seedLifecycle('incomplete', 'failed');

    mockFetch.mockClear();

    adapter.setScore(40);
    adapter.setSuccessStatus('failed');
    await flush();
    expect(sentVerbs()).not.toContain('failed');

    adapter.terminate();
    await flush();

    expect(sentVerbs().filter((id) => id === 'failed')).toHaveLength(1);
  });

  it('holds Failed for Terminated and drops it when the session passes', async () => {
    const adapter = await initAdapter();
    mockFetch.mockClear();

    adapter.setSuccessStatus('failed');
    await flush();
    expect(sentVerbs()).not.toContain('failed');

    adapter.setSuccessStatus('passed');
    adapter.terminate();
    await flush();

    expect(sentVerbs()).toContain('passed');
    expect(sentVerbs()).not.toContain('failed');
  });

  it('after seedLifecycle("failed"), a transition to passed still emits Passed', async () => {
    const adapter = await initAdapter();

    adapter.seedLifecycle('incomplete', 'failed');

    mockFetch.mockClear();

    adapter.setScore(85);
    adapter.setSuccessStatus('passed');
    adapter.setCompletionStatus('complete');

    await flush();

    expect(sentVerbs()).toContain('passed');
    expect(sentVerbs()).toContain('completed');
  });

  it('seedLifecycle suppresses duplicate Completed and Passed when resuming a completed session', async () => {
    const adapter = await initAdapter();

    adapter.seedLifecycle('complete', 'passed');

    mockFetch.mockClear();

    adapter.setScore(85);
    adapter.setCompletionStatus('complete');
    adapter.setSuccessStatus('passed');

    await flush();

    expect(statementRequests(mockFetch)).toHaveLength(0);
  });

  it('includes auth header on xAPI requests', async () => {
    await initAdapter();

    // Check that statements call includes auth header
    const statementCalls = statementRequests(mockFetch);
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
    await initAdapter({
      launchData: {
        contextTemplate: {
          contextActivities: {
            grouping: [{ id: publisherActivity }],
          },
          extensions: {
            [SESSION_ID_EXT]: lmsSession,
          },
        },
      },
    });

    const initialized = statementFor('initialized');
    expect(initialized).toBeDefined();
    expect(initialized.context.extensions[SESSION_ID_EXT]).toBe(lmsSession);
    expect(initialized.context.contextActivities.grouping).toEqual([
      { id: publisherActivity },
    ]);
  });

  it('falls back to a minted UUID when LMS.LaunchData has no session id', async () => {
    // When the LMS doesn't pre-populate sessionid (non-conformant or
    // dev fixtures), the publisher mints a UUID — the cmi5 v1 fallback.
    await initAdapter();

    const initialized = statementFor('initialized');
    const sid = initialized?.context?.extensions?.[SESSION_ID_EXT];
    expect(sid).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it('parses the spec-conformant JSON token body from the fetch URL', async () => {
    // cmi5 §11.2: the fetch endpoint returns
    //   { "auth-token": "<base64-encoded credentials>" }
    // Stuffing the entire JSON string into `Basic <...>` produces the
    // "Malformed authorization header" 400 SCORM Cloud returns.
    await initAdapter({ token: '{"auth-token": "spec-conformant-token"}' });

    const statementCalls = statementRequests(mockFetch);
    const headers = statementCalls[0][1].headers;
    expect(headers.get('Authorization')).toBe('Basic spec-conformant-token');
  });

  it('throws when fetch URL returns a spec-defined error JSON instead of a token', async () => {
    await expect(
      initAdapter({
        token:
          '{"error-code":"1","error-text":"The authorization token has already been returned."}',
      }),
    ).rejects.toThrow(/error-code=1.*already been returned/);
    expect(statementRequests(mockFetch)).toHaveLength(0);
  });

  it('includes registration and context in statements', async () => {
    await initAdapter();

    const [body] = sentStatements();
    expect(body.context.registration).toBe('reg-123');
    expect(body.object.id).toBe('https://example.com/course/1');
    expect(body.actor).toEqual({
      mbox: 'mailto:test@example.com',
      name: 'Test User',
    });
  });

  it('commit is a no-op', async () => {
    const adapter = await initAdapter();
    mockFetch.mockClear();

    adapter.commit();

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('terminate sends Terminated only — cmi5 has no Suspended verb (§9.3)', async () => {
    // The cmi5 §9.3 verb enumeration covers nine verbs and "Suspended"
    // is not among them. An incomplete-exit signal is conveyed by the
    // *absence* of Completed before Terminated; the LMS handles
    // resume / Abandoned itself from the registration state.
    const adapter = await initAdapter();
    await flush();

    mockFetch.mockClear();

    adapter.setDuration(120);
    adapter.terminate();

    await flush();

    const sent = sentStatements();
    expect(sent).toHaveLength(1);
    const [terminated] = sent;
    expect(terminated.verb.id).toBe(`${VERB}terminated`);
    // cmi5 §9.5.4.1 — Terminated must include result.duration.
    expect(terminated.result.duration).toBe('PT2M');
    // Nothing with a "suspended" verb.
    expect(sentVerbs()).not.toContain('suspended');
  });

  it('terminate sends Terminated only (no Suspended) after course is completed', async () => {
    const adapter = await initAdapter();

    adapter.setScore(85);
    adapter.setDuration(60);
    adapter.setCompletionStatus('complete');
    await flush();

    mockFetch.mockClear();

    adapter.terminate();
    await flush();

    const sent = sentStatements();
    expect(sent).toHaveLength(1);
    expect(sent[0].verb.id).toBe(`${VERB}terminated`);
    expect(sent[0].result.duration).toBe('PT1M');
  });

  it('terminate is idempotent', async () => {
    const adapter = await initAdapter();

    adapter.setCompletionStatus('complete');
    await flush();

    mockFetch.mockClear();

    adapter.terminate();
    adapter.terminate();

    await flush();

    expect(statementRequests(mockFetch)).toHaveLength(1);
  });

  it('terminate starts the state write and a queued-then-Terminated batch before returning', async () => {
    const adapter = await initAdapter();
    await flush();

    mockFetch.mockClear();
    mockFetch.mockReturnValueOnce(new Promise(() => {}));
    adapter.saveState({ b: 1 } as never);
    await flush();
    adapter.setCompletionStatus('complete');

    adapter.terminate();

    const sent = mockFetch.mock.calls.slice(1);
    expect(
      sent.map(
        ([url, init]: any[]) => `${init.method} ${new URL(url).pathname}`,
      ),
    ).toEqual(['PUT /xapi/activities/state', 'POST /xapi/statements']);
    expect(sent.every(([, init]: any[]) => init.keepalive)).toBe(true);
    expect(JSON.parse(sent[1][1].body).map((s: any) => s.verb.id)).toEqual([
      `${VERB}completed`,
      `${VERB}terminated`,
    ]);
  });

  it('stops retrying the resume GET once terminated, and still refuses to save', async () => {
    const adapter = await initAdapter();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const resumeGet = vi.fn(async (): Promise<Response> => {
      throw new Error('network down');
    });
    routeResumeGet(resumeGet);
    const loading = adapter.loadState();
    await flush();

    adapter.terminate();
    await loading;
    adapter.saveState({ b: 0, v: [0], d: 1 });
    await flush();

    expect(resumeGet).toHaveBeenCalledTimes(1);
    expect(sentVerbs()).toEqual(['initialized', 'terminated']);
    expect(stateWrites()).toHaveLength(0);
    expect(warn).not.toHaveBeenCalled();
  });

  it('writes the final state to the exit document and keeps saving after terminate', async () => {
    const adapter = await initAdapter();
    await adapter.loadState();

    mockFetch.mockClear();
    adapter.saveState({ b: 1 } as never);
    adapter.terminate();
    adapter.saveState({ b: 2 } as never);
    await flush();

    const puts = stateWrites().map(([url, init]: any[]) => [
      new URL(url).searchParams.get('stateId'),
      JSON.parse(init.body),
    ]);
    expect(puts).toEqual([
      ['tessera-state-exit', { b: 1, n: 1 }],
      ['tessera-state', { b: 2, n: 2 }],
    ]);
  });

  it('resumes from the state document with the higher write sequence', async () => {
    const adapter = await initAdapter();
    mockFetch.mockImplementation(async (url: string, options?: RequestInit) => {
      if (url.includes('activities/state') && options?.method === 'GET') {
        return Response.json(
          url.includes('tessera-state-exit') ? { b: 2, n: 5 } : { b: 1, n: 4 },
        );
      }
      return respond(204);
    });
    await adapter.loadState();
    expect(adapter.getState()).toEqual({ b: 2 });

    mockFetch.mockClear();
    adapter.saveState({ b: 3 } as never);
    await flush();
    const [[, init]] = stateWrites();
    expect(JSON.parse(init.body)).toEqual({ b: 3, n: 6 });
  });

  describe('LMS launch params: masteryScore + moveOn (cmi5 §8, §9.5.3)', () => {
    it('parses masteryScore and exposes it via getMasteryScore()', async () => {
      setLaunchParams({ ...CMI5_LAUNCH, masteryScore: '0.8' });
      const adapter = await initAdapter();
      expect(adapter.getMasteryScore()).toBe(0.8);
    });

    it('returns null when no masteryScore is present', async () => {
      const adapter = await initAdapter();
      expect(adapter.getMasteryScore()).toBeNull();
    });

    it('rejects masteryScore outside [0, 1] and warns', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      setLaunchParams({ ...CMI5_LAUNCH, masteryScore: '1.5' });
      const adapter = await initAdapter();
      expect(adapter.getMasteryScore()).toBeNull();
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('masteryScore'),
      );
    });

    it('does NOT attach masteryscore extension to Completed (§9.6.3.2 scopes it to Passed/Failed)', async () => {
      setLaunchParams({ ...CMI5_LAUNCH, masteryScore: '0.7' });
      const adapter = await initAdapter();
      mockFetch.mockClear();

      adapter.setScore(85);
      adapter.setDuration(60);
      adapter.setCompletionStatus('complete');
      await flush();

      const completed = statementFor('completed');
      expect(completed).toBeDefined();
      const ext = completed?.context?.extensions ?? {};
      expect(ext[MASTERY_EXT]).toBeUndefined();
    });

    it('attaches masteryscore extension to Passed and Failed', async () => {
      setLaunchParams({ ...CMI5_LAUNCH, masteryScore: '0.6' });
      const adapter = await initAdapter();
      mockFetch.mockClear();

      adapter.setScore(40);
      adapter.setSuccessStatus('failed');
      adapter.terminate();
      await flush();

      const failed = statementFor('failed');
      expect(failed.context.extensions[MASTERY_EXT]).toBe(0.6);
    });

    it('omits the extension entirely when masteryScore is absent', async () => {
      const adapter = await initAdapter();
      mockFetch.mockClear();

      adapter.setScore(85);
      adapter.setCompletionStatus('complete');
      await flush();

      const completed = statementFor('completed');
      const ext = completed?.context?.extensions ?? {};
      expect(ext[MASTERY_EXT]).toBeUndefined();
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
        setLaunchParams({ ...CMI5_LAUNCH, moveOn, masteryScore: '0.7' });
        const adapter = await initAdapter();
        mockFetch.mockClear();

        adapter.setScore(90);
        adapter.setCompletionStatus('complete');
        adapter.setSuccessStatus('passed');
        await flush();

        expect(sentVerbs()).not.toContain(
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

    function categoryIds(body: any): string[] {
      const cats = body?.context?.contextActivities?.category ?? [];
      return cats
        .map((c: any) => c?.id)
        .filter((id: any) => typeof id === 'string');
    }

    it('tags Initialized with the cmi5 category', async () => {
      await initAdapter();
      const initialized = statementFor('initialized');
      expect(categoryIds(initialized)).toEqual([CMI5_CAT]);
    });

    it('tags Completed with cmi5 + moveOn categories', async () => {
      const adapter = await initAdapter();
      mockFetch.mockClear();
      adapter.setCompletionStatus('complete');
      await flush();
      const completed = statementFor('completed');
      expect(categoryIds(completed)).toEqual([CMI5_CAT, MOVEON_CAT]);
    });

    it('tags Passed and Failed with cmi5 + moveOn categories', async () => {
      const adapter = await initAdapter();
      mockFetch.mockClear();
      adapter.setSuccessStatus('passed');
      await flush();
      const passed = statementFor('passed');
      expect(categoryIds(passed)).toEqual([CMI5_CAT, MOVEON_CAT]);

      const adapter2 = await initAdapter();
      mockFetch.mockClear();
      adapter2.setSuccessStatus('failed');
      adapter2.terminate();
      await flush();
      const failed = statementFor('failed');
      expect(categoryIds(failed)).toEqual([CMI5_CAT, MOVEON_CAT]);
    });

    it('tags Terminated with the cmi5 category only', async () => {
      const adapter = await initAdapter();
      await flush();
      mockFetch.mockClear();
      adapter.terminate();
      await flush();
      const terminated = statementFor('terminated');
      expect(categoryIds(terminated)).toEqual([CMI5_CAT]);
    });

    it('does NOT tag Answered with the cmi5 category (it is an Allowed Statement, not Defined)', async () => {
      const adapter = await initAdapter();
      mockFetch.mockClear();
      adapter.reportInteraction(
        'q1',
        { type: 'choice', response: ['a'], correct: ['a'] },
        true,
      );
      await flush();
      const answered = statementFor('answered');
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
      const adapter = await initAdapter();
      mockFetch.mockClear();
      adapter.reportInteraction(questionId, interaction, correct);
      await flush();
      const sent = sentStatements();
      expect(sent).toHaveLength(1);
      return sent[0];
    }

    it('sends xAPI answered statement for choice', async () => {
      const body = await initAndReport(
        'q1',
        { type: 'choice', response: ['a', 'b'], correct: ['a'] },
        false,
      );
      expect(body.verb.id).toBe(`${VERB}answered`);
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

    it('keeps every long-fill-in alternative (no SCORM 2004 cap)', async () => {
      const body = await initAndReport(
        'q1',
        {
          type: 'long-fill-in',
          response: 'answer two',
          correct: ['answer one', 'answer two'],
        },
        true,
      );
      expect(body.object.definition.correctResponsesPattern).toEqual([
        'answer one',
        'answer two',
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

  describe('exit() and the returnURL redirect (cmi5 §10.2.6)', () => {
    it('waits for a statement already sending before Terminated', async () => {
      const adapter = await initAdapter();
      await flush();

      mockFetch.mockClear();
      const sending = Promise.withResolvers<Response>();
      mockFetch.mockReturnValueOnce(sending.promise);
      adapter.setCompletionStatus('complete');
      await flush();

      let exited = false;
      const exiting = adapter.exit(noDeadline).then(() => (exited = true));
      await flush();
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(exited).toBe(false);

      sending.resolve(respond(204));
      await exiting;
      expect(statementFor('terminated')).toBeDefined();
    });

    it('sends the learner to the returnURL', async () => {
      const returnURL = 'https://lms.example.com/learner/done';
      const adapter = await initAdapter({ launchData: { returnURL } });
      const assign = stubLocationAssign();

      expect(adapter.returnToLMS()).toBe(true);
      expect(assign).toHaveBeenCalledWith(returnURL);
    });

    it('sends a held Failed before Terminated', async () => {
      const adapter = await initAdapter();
      mockFetch.mockClear();

      adapter.setScore(40);
      adapter.setSuccessStatus('failed');
      await adapter.exit(noDeadline);

      const ids = sentVerbs();
      expect(ids).toContain('failed');
      expect(ids.indexOf('failed')).toBeLessThan(ids.indexOf('terminated'));
    });

    it('saves the final state once, without keepalive', async () => {
      const adapter = await initAdapter();
      await adapter.loadState();

      mockFetch.mockClear();
      adapter.saveState({ b: 1 } as never);
      await adapter.exit(noDeadline);

      const puts = stateWrites();
      expect(puts).toHaveLength(1);
      expect(new URL(puts[0][0]).searchParams.get('stateId')).toBe(
        'tessera-state',
      );
      expect(puts[0][1].keepalive).toBeUndefined();
    });

    it('writes the exit state when the final save fails', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      const adapter = await initAdapter();
      await adapter.loadState();

      mockFetch.mockClear();
      mockFetch.mockResolvedValueOnce(respond(500));
      adapter.saveState({ b: 1 } as never);
      await adapter.exit(noDeadline);

      const exitPut = stateWrites().find(([url]: any[]) =>
        url.includes('tessera-state-exit'),
      );
      expect(exitPut?.[1].keepalive).toBe(true);
    });

    it('stops waiting on a stalled LRS at the deadline', async () => {
      const adapter = await initAdapter();
      await adapter.loadState();

      mockFetch.mockClear();
      mockFetch.mockReturnValueOnce(new Promise<Response>(() => {}));
      adapter.saveState({ b: 1 } as never);
      const deadline = Promise.withResolvers<void>();
      let exited = false;
      const exiting = adapter
        .exit(deadline.promise)
        .then(() => (exited = true));
      await flush();
      expect(exited).toBe(false);
      deadline.resolve();
      await exiting;

      expect(statementFor('terminated')).toBeDefined();
      const exitPut = stateWrites().find(([url]: any[]) =>
        url.includes('tessera-state-exit'),
      );
      expect(exitPut?.[1].keepalive).toBe(true);
    });

    it.each(['javascript:alert(1)', '/lms/course/42'])(
      'warns and ignores a returnURL that is not absolute http(s): %s',
      async (returnURL) => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const adapter = await initAdapter({ launchData: { returnURL } });

        const assign = stubLocationAssign();

        expect(adapter.returnToLMS()).toBe(false);
        expect(assign).not.toHaveBeenCalled();
        expect(warn).toHaveBeenCalledWith(
          expect.stringContaining(`returnURL "${returnURL}"`),
        );
      },
    );

    it('still terminates but skips redirect when LMS did not supply a returnURL', async () => {
      const adapter = await initAdapter();

      const assign = stubLocationAssign();
      mockFetch.mockClear();

      await adapter.exit(noDeadline);
      expect(statementFor('terminated')).toBeDefined();
      expect(adapter.returnToLMS()).toBe(false);
      expect(assign).not.toHaveBeenCalled();
    });
  });

  describe('LMS.LaunchData fields (cmi5 §10.2)', () => {
    it.each([
      ['LaunchData is absent', undefined],
      ['launchMode is invalid', { launchMode: 'NotARealMode' }],
    ])(
      'launches in Normal mode and emits Completed when %s',
      async (_, data) => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        const adapter = await initAdapter({ launchData: data });
        mockFetch.mockClear();
        adapter.setCompletionStatus('complete');
        await flush();
        expect(statementFor('completed')).toBeDefined();
      },
    );

    it('prefers LaunchData.masteryScore over the URL launch param (§10.2.4)', async () => {
      // URL says 0.5, LaunchData says 0.8 — LaunchData is the authoritative
      // source per the spec (§10.2.4). The URL form is non-standard.
      setLaunchParams({ ...CMI5_LAUNCH, masteryScore: '0.5' });
      const adapter = await initAdapter({ launchData: { masteryScore: 0.8 } });
      expect(adapter.getMasteryScore()).toBe(0.8);
    });

    it('keeps the URL masteryScore and warns when LaunchData.masteryScore is out of range', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      setLaunchParams({ ...CMI5_LAUNCH, masteryScore: '0.5' });
      const adapter = await initAdapter({ launchData: { masteryScore: 1.5 } });
      expect(adapter.getMasteryScore()).toBe(0.5);
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('LaunchData masteryScore'),
      );
    });

    it('does NOT emit Completed under launchMode=Browse (§10.2.2)', async () => {
      const adapter = await initAdapter({
        launchData: { launchMode: 'Browse' },
      });
      mockFetch.mockClear();
      adapter.setCompletionStatus('complete');
      await flush();
      expect(statementFor('completed')).toBeUndefined();
    });

    it('does NOT emit Passed or Failed under launchMode=Review (§10.2.2)', async () => {
      const adapter = await initAdapter({
        launchData: { launchMode: 'Review' },
      });
      mockFetch.mockClear();
      adapter.setScore(95);
      adapter.setSuccessStatus('passed');
      await flush();
      expect(statementFor('passed')).toBeUndefined();
      expect(statementFor('failed')).toBeUndefined();
    });

    it('does NOT emit Suspended under launchMode=Browse on terminate (§10.2.2)', async () => {
      const adapter = await initAdapter({
        launchData: { launchMode: 'Browse' },
      });
      await flush();
      mockFetch.mockClear();
      adapter.terminate();
      await flush();
      expect(statementFor('suspended')).toBeUndefined();
      // Terminated is always allowed.
      expect(statementFor('terminated')).toBeDefined();
    });

    it('fetches Learner Preferences BEFORE sending Initialized (§11)', async () => {
      // cmi5 §11 requires the AU to retrieve the Learner Preferences
      // document. SCORM Cloud enforces this by rejecting Initialized
      // with "The AU must retrieve Learner Preferences document from
      // the Agent Profile" if the AU hits /statements before
      // /agents/profile. The order matters even when the prefs doc
      // itself 404s (no preferences set is a valid state).
      await initAdapter();

      const urls = mockFetch.mock.calls.map(([url]) => String(url));
      expect(urls.findIndex((u) => u.includes('agents/profile'))).toBeLessThan(
        urls.findIndex((u) => u.includes('/statements')),
      );
    });

    it('rejects a malformed actor before spending the single-use fetch URL', async () => {
      setLaunchParams({ ...CMI5_LAUNCH, actor: 'not-json' });
      mockFetch.mockClear();
      await expect(initAdapter()).rejects.toThrow(/actor/);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('rejects a relative endpoint before spending the single-use fetch URL', async () => {
      setLaunchParams({ ...CMI5_LAUNCH, endpoint: '/lrs' });
      mockFetch.mockClear();
      await expect(initAdapter()).rejects.toThrow(
        /launch parameter 'endpoint' is not an absolute http\(s\) URL/,
      );
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('rejects a fetched token carrying the Basic scheme before any LRS request', async () => {
      mockFetch.mockClear();
      await expect(
        initAdapter({ token: '{"auth-token": "Basic dGVzdA=="}' }),
      ).rejects.toThrow(/fetch token must be the Basic credential value only/);
      expect(mockFetch.mock.calls.map(([url]) => url)).toEqual([
        CMI5_LAUNCH.fetch,
      ]);
    });

    it('reads LMS.LaunchData with the fetched token', async () => {
      mockFetch.mockClear();
      await initAdapter();

      const urls = mockFetch.mock.calls.map(([url]) => String(url));
      const launchData = urls.findIndex((u) => u.includes('LMS.LaunchData'));
      expect(urls.indexOf(CMI5_LAUNCH.fetch)).toBeLessThan(launchData);
      const [, init] = mockFetch.mock.calls[launchData];
      expect(init.headers.get('Authorization')).toBe('Basic test-auth-token');
    });
  });

  describe('contextTemplate merge (cmi5 §10.2.1)', () => {
    it('concats LMS-supplied template categories with cmi5 + moveOn instead of overwriting', async () => {
      // cmi5 §10.2.1 — the AU MUST NOT overwrite contextTemplate values.
      // If the LMS pre-populates `category`, the AU must merge (concat
      // + dedupe), not replace.
      const lmsCategory = {
        id: 'https://lms.example.com/cat/custom',
        objectType: 'Activity',
      };
      const adapter = await initAdapter({
        launchData: {
          contextTemplate: {
            contextActivities: { category: [lmsCategory] },
          },
        },
      });
      mockFetch.mockClear();
      adapter.setCompletionStatus('complete');
      await flush();
      const completed = statementFor('completed');
      const ids = completed.context.contextActivities.category.map(
        (c: any) => c.id,
      );
      expect(ids).toContain(lmsCategory.id);
      expect(ids).toContain(CMI5_CAT);
      expect(ids).toContain(MOVEON_CAT);
    });
  });

  describe('score validation (cmi5 §9.5.1, §9.3.4)', () => {
    it('clamps setScore to [0, 100] so scaled stays in [0, 1] (xAPI)', async () => {
      // Score is asserted on Passed (not Completed) because cmi5 §9.5.1
      // forbids score on Completed.
      const adapter = await initAdapter();
      mockFetch.mockClear();

      adapter.setScore(150);
      adapter.setSuccessStatus('passed');
      await flush();
      const passed = statementFor('passed');
      expect(passed.result.score.scaled).toBe(1);
    });

    it('omits scaled score on Passed when below masteryScore (§9.3.4)', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      const adapter = await initAdapter({ launchData: { masteryScore: 0.8 } });
      mockFetch.mockClear();

      adapter.setScore(50); // scaled = 0.5, below mastery 0.8
      adapter.setSuccessStatus('passed');
      await flush();
      const passed = statementFor('passed');
      expect(passed).toBeDefined();
      // The Passed verb is still emitted (author asserted it) but
      // without a score that would make the statement non-conformant.
      expect(passed.result.score).toBeUndefined();
    });

    it('keeps scaled score on Passed when at or above masteryScore', async () => {
      const adapter = await initAdapter({
        launchData: { masteryScore: 0.533 },
      });
      mockFetch.mockClear();

      adapter.setScore(53.3);
      adapter.setSuccessStatus('passed');
      await flush();
      const passed = statementFor('passed');
      expect(passed.result.score.scaled).toBe(0.533);
    });

    it('keeps scaled score on Failed when below mastery', async () => {
      const adapter = await initAdapter({ launchData: { masteryScore: 0.7 } });
      mockFetch.mockClear();

      adapter.setScore(40);
      adapter.setSuccessStatus('failed');
      adapter.terminate();
      await flush();
      const failed = statementFor('failed');
      expect(failed.result.score.scaled).toBeCloseTo(0.4);
    });

    it('omits scaled score on Failed when at or above masteryScore (§9.3.5)', async () => {
      // Symmetric to the Passed/§9.3.4 invariant: a Failed statement
      // carrying a score MUST have scaled < masteryScore.
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      const adapter = await initAdapter({ launchData: { masteryScore: 0.7 } });
      mockFetch.mockClear();

      adapter.setScore(85); // scaled = 0.85, above mastery 0.7
      adapter.setSuccessStatus('failed');
      adapter.terminate();
      await flush();
      const failed = statementFor('failed');
      expect(failed).toBeDefined();
      expect(failed.result.score).toBeUndefined();
    });

    it('keeps the score on Failed when the AU declares no masteryScore', async () => {
      const adapter = await initAdapter({
        launchData: { launchMode: 'Normal' },
      });
      mockFetch.mockClear();

      adapter.setScore(85);
      adapter.setSuccessStatus('failed');
      adapter.terminate();
      await flush();
      const failed = statementFor('failed');
      expect(failed).toBeDefined();
      expect(failed.result.score.scaled).toBeCloseTo(0.85);
    });

    it('sends Scored when a retry raises the score without flipping Passed', async () => {
      const adapter = await initAdapter({ launchData: { masteryScore: 0.7 } });
      adapter.setScore(85);
      adapter.setSuccessStatus('passed');
      adapter.commit();
      await flush();
      mockFetch.mockClear();

      adapter.setScore(95);
      adapter.setSuccessStatus('passed');
      adapter.commit();
      await flush();

      const scored = statementFor('scored');
      expect(scored.result.score.scaled).toBeCloseTo(0.95);
      expect(scored.context?.contextActivities?.category).toBeUndefined();
      expect(statementFor('passed')).toBeUndefined();
    });

    it('sends Scored under launchMode=Browse, where Defined Statements are barred (§10.2.2)', async () => {
      const adapter = await initAdapter({
        launchData: { launchMode: 'Browse' },
      });
      mockFetch.mockClear();

      adapter.setScore(60);
      adapter.setSuccessStatus('failed');
      adapter.commit();
      adapter.terminate();
      await flush();

      expect(statementFor('failed')).toBeUndefined();
      expect(statementFor('scored').result.score.scaled).toBeCloseTo(0.6);
    });
  });
});
