import type { PersistenceAdapter, SavedState } from '../persistence.js';
import type { Interaction } from '../interaction.js';
import { formatResponse, formatCorrectPattern } from '../interaction-format.js';
import { formatISO8601Duration } from './retry.js';
import { XAPIPublisher } from '../xapi/publisher.js';
import { X_API_VERSION } from '../xapi/version.js';
import type { XAPIAgent } from '../xapi/types.js';

/**
 * xAPI verb IRIs used by CMI5.
 */
const VERBS = {
  initialized: 'http://adlnet.gov/expapi/verbs/initialized',
  answered: 'http://adlnet.gov/expapi/verbs/answered',
  completed: 'http://adlnet.gov/expapi/verbs/completed',
  passed: 'http://adlnet.gov/expapi/verbs/passed',
  failed: 'http://adlnet.gov/expapi/verbs/failed',
  suspended: 'http://adlnet.gov/expapi/verbs/suspended',
  terminated: 'http://adlnet.gov/expapi/verbs/terminated',
  satisfied: 'https://w3id.org/xapi/adl/verbs/satisfied',
} as const;

const CMI_INTERACTION_TYPE = 'http://adlnet.gov/expapi/activities/cmi.interaction';

const CMI5_MASTERYSCORE_EXT =
  'https://w3id.org/xapi/cmi5/context/extensions/masteryscore';

// cmi5 §9.6 — every cmi5 Defined Statement MUST carry the "cmi5" Category
// Activity in context.contextActivities.category, and "completed", "passed",
// "failed" MUST additionally carry the "moveOn" Category. Without these, an
// LRS will accept the statement as an arbitrary xAPI verb but won't roll it
// up into cmi5 lifecycle state — the LMS never sees the AU as completed.
const CMI5_CATEGORY_CMI5 =
  'https://w3id.org/xapi/cmi5/context/categories/cmi5';
const CMI5_CATEGORY_MOVEON =
  'https://w3id.org/xapi/cmi5/context/categories/moveon';

export type CMI5MoveOn =
  | 'Passed'
  | 'Completed'
  | 'CompletedAndPassed'
  | 'CompletedOrPassed'
  | 'NotApplicable';

const VALID_MOVE_ON: ReadonlySet<CMI5MoveOn> = new Set([
  'Passed',
  'Completed',
  'CompletedAndPassed',
  'CompletedOrPassed',
  'NotApplicable',
]);

/**
 * Pull a session id out of the LMS's fetch URL when it embeds one as a
 * query parameter. cmi5 v1 §9.6.2 allows either the LMS or the AU to
 * choose the session id; SCORM Cloud picks it server-side and bakes it
 * into the fetch URL (e.g. `?session=<uuid>`), and rejects every
 * statement whose sessionid extension doesn't match with "Forbidden
 * cmi5 allowed statement: session id does not match request context".
 * Returns undefined when no candidate parameter is present, leaving the
 * publisher to mint its own UUID — the cmi5-v1-spec default.
 */
function extractSessionFromFetchUrl(fetchUrl: string): string | undefined {
  try {
    const url = new URL(fetchUrl);
    // The cmi5 spec doesn't standardize the parameter name, so accept
    // common variants. The SCORM Cloud convention is `session`.
    const candidates = ['session', 'sessionId', 'session-id', 'sessionid'];
    for (const key of candidates) {
      const v = url.searchParams.get(key);
      if (v && v.trim()) return v.trim();
    }
  } catch {
    // Not a parseable URL — let the publisher mint its own UUID.
  }
  return undefined;
}

/**
 * CMI5 persistence adapter using xAPI.
 *
 * Lifecycle statements (Initialized, Completed, Passed/Failed, Terminated)
 * and per-interaction Answered statements all flow through a single
 * `XAPIPublisher` configured with `cmi5Mode: true`. The publisher's
 * sequential queue is what guarantees Terminated lands last (cmi5 §9.3.6),
 * and `cmi5Mode` injects the required `sessionid` context extension on
 * every statement (cmi5 §9.6.1.1).
 *
 * State API GET/PUT cannot be expressed as `sendStatement` calls (different
 * URL, different verbs), so they go through `chainTask` so a state PUT is
 * still ordered relative to neighboring statements.
 */
export class CMI5Adapter implements PersistenceAdapter {
  #publisher: XAPIPublisher | null = null;
  #endpoint = '';
  #activityId = '';
  #actor: XAPIAgent | null = null;
  #registration: string | undefined;
  #authToken = '';

  // Stored internally for inclusion in statements
  #score: number | null = null;
  #durationSeconds = 0;
  #state: SavedState | null = null;
  #completedSent = false;
  #completionStatus: 'incomplete' | 'complete' = 'incomplete';
  #successSent = false;
  #passed = false;
  #terminated = false;

  // cmi5 §8 launch params. masteryScore (when present) overrides the
  // course's manifest passingScore for this launch — the LMS is the
  // authority. moveOn drives the optional Satisfied statement (§9.5.3).
  #masteryScore: number | null = null;
  #moveOn: CMI5MoveOn = 'NotApplicable';
  #satisfiedSent = false;

  async init(): Promise<void> {
    const params = new URLSearchParams(window.location.search);
    const fetchUrl = params.get('fetch');
    // Normalize endpoint to always have a trailing slash so URL concatenation is safe
    this.#endpoint = (params.get('endpoint') || '').replace(/\/?$/, '/');
    const reg = params.get('registration') || '';
    // xAPI requires `context.registration` to be a UUID; sending an empty
    // string makes LRSes 400. Omit when the LMS didn't provide one.
    this.#registration = reg ? reg : undefined;
    this.#activityId = params.get('activityId') || '';

    const rawMastery = params.get('masteryScore');
    if (rawMastery !== null && rawMastery !== '') {
      const m = Number(rawMastery);
      if (Number.isFinite(m) && m >= 0 && m <= 1) {
        this.#masteryScore = m;
      } else {
        console.warn(
          `Tessera cmi5: launch parameter 'masteryScore' is not a decimal in [0,1] (got "${rawMastery}"); ignoring.`
        );
      }
    }

    const rawMoveOn = params.get('moveOn');
    if (rawMoveOn !== null && rawMoveOn !== '') {
      if (VALID_MOVE_ON.has(rawMoveOn as CMI5MoveOn)) {
        this.#moveOn = rawMoveOn as CMI5MoveOn;
      } else {
        console.warn(
          `Tessera cmi5: launch parameter 'moveOn' is not a recognized value (got "${rawMoveOn}"); defaulting to NotApplicable.`
        );
      }
    }

    // Malformed actor JSON is a launch-time failure: an empty {} actor
    // would fail every Identified-Agent check downstream and produce
    // confusing 400s on every send. Fail loud here instead.
    const rawActor = params.get('actor') || '';
    try {
      const parsed = JSON.parse(rawActor);
      if (!parsed || typeof parsed !== 'object') {
        throw new Error('actor must be an object');
      }
      this.#actor = parsed as XAPIAgent;
    } catch (err) {
      throw new Error(
        `Tessera cmi5: launch parameter 'actor' is malformed (${err instanceof Error ? err.message : String(err)}). The LMS did not send a valid Identified Agent JSON.`
      );
    }

    // The cmi5 fetch URL is single-use (§6.2): if it fails we can't retry,
    // and continuing with no token will 401-loop until auth is marked dead.
    // Fail loud at launch instead of dribbling errors per statement.
    if (!fetchUrl) {
      throw new Error(
        "Tessera cmi5: launch parameter 'fetch' is missing. Cannot acquire LMS auth token."
      );
    }
    let resp: Response;
    try {
      resp = await fetch(fetchUrl, { method: 'POST' });
    } catch (err) {
      throw new Error(
        `Tessera cmi5: fetch token request failed (${err instanceof Error ? err.message : String(err)}). The cmi5 launch fetch URL is single-use; reload from the LMS to retry.`
      );
    }
    if (!resp.ok) {
      throw new Error(
        `Tessera cmi5: fetch token request returned ${resp.status}. The cmi5 launch fetch URL is single-use; reload from the LMS to retry.`
      );
    }
    const text = (await resp.text()).trim();
    // cmi5 §11.2: the spec-conformant response is JSON of the form
    //   { "auth-token": "<base64-encoded credentials>" }
    // Some older/non-conformant LMSes return the value as plain text,
    // optionally with an "auth-token=" prefix. Try JSON first, then fall
    // back to the legacy forms. The credential itself is the value used
    // as the "Basic" Authorization header — NOT a Bearer token.
    //
    // The LMS MAY also pass an explicit session id alongside the
    // token. cmi5 v1 §9.6.2 allows either side to pick the value; when
    // the LMS provides one, the AU must use it. The key isn't
    // standardized, so accept the common spellings.
    let token = '';
    let sessionId: string | undefined;
    if (text.startsWith('{')) {
      try {
        const parsed = JSON.parse(text);
        if (parsed && typeof parsed['auth-token'] === 'string') {
          token = parsed['auth-token'].trim();
        }
        const sid =
          parsed?.['session-id'] ??
          parsed?.['sessionId'] ??
          parsed?.['sessionid'] ??
          parsed?.['session_id'];
        if (typeof sid === 'string' && sid.trim()) {
          sessionId = sid.trim();
        }
      } catch {
        // fall through to legacy parsing
      }
    }
    if (!token) {
      token = text.replace(/^auth-token=/, '').trim();
    }
    this.#authToken = token;
    if (!this.#authToken) {
      throw new Error(
        'Tessera cmi5: fetch token request returned an empty token. Expected a JSON body of the form {"auth-token": "..."}.'
      );
    }

    // SCORM Cloud (and other Rustici-based LRSes) embed the cmi5
    // session id as a query parameter on the fetch URL itself —
    // there's no other channel in the cmi5 launch surface that
    // communicates it. Without using that exact value, every cmi5
    // statement is rejected with "Forbidden cmi5 allowed statement:
    // session id does not match request context". Fall back to the
    // fetch-URL extraction when the response body didn't carry one.
    if (!sessionId) {
      sessionId = extractSessionFromFetchUrl(fetchUrl);
    }

    this.#publisher = new XAPIPublisher({
      endpoint: this.#endpoint,
      auth: this.#authToken,
      actor: this.#actor,
      activityId: this.#activityId,
      registration: this.#registration,
      sessionId,
      cmi5Mode: true,
    });
    await this.#publisher.init();

    // Retrieve saved state from xAPI State API. The State API is a different
    // URL than statements/, so it doesn't go through the publisher's send
    // path — but we still use the same auth/headers.
    try {
      const stateUrl = this.#buildStateUrl();
      const resp = await this.#xapiFetch(stateUrl, { method: 'GET' });
      if (resp.ok) {
        this.#state = await resp.json();
      } else if (resp.status !== 404) {
        console.warn(
          `Tessera cmi5: State API GET returned ${resp.status}; resume disabled for this launch.`
        );
      }
    } catch (err) {
      console.warn(
        `Tessera cmi5: State API GET failed (${err instanceof Error ? err.message : String(err)}); resume disabled for this launch.`
      );
      this.#state = null;
    }

    // Send Initialized statement (queued through publisher). Log failures
    // here too — the publisher's per-destination outcome covers transport
    // errors but won't surface to console; lifecycle statements are rare
    // enough that an explicit warning helps production triage.
    await this.#publisher
      .sendStatement({
        verb: { id: VERBS.initialized, display: { 'en-US': 'initialized' } },
        context: this.#cmi5Context(),
      })
      .catch((err) => {
        console.warn('Tessera cmi5: failed to send Initialized statement', err);
      });
  }

  /**
   * Returns the underlying publisher so the xAPI client can fan author-
   * issued statements to the LMS-launched LRS via `endpoint: 'lms'`. Null
   * when init() hasn't run yet.
   */
  getPublisher(): XAPIPublisher | null {
    return this.#publisher;
  }

  /**
   * LMS-supplied masteryScore from the cmi5 launch URL (a decimal in
   * [0, 1]), or null when omitted. When present, the runtime should treat
   * it as the authoritative pass threshold for this session, overriding
   * `course.config.js scoring.passingScore`.
   */
  getMasteryScore(): number | null {
    return this.#masteryScore;
  }

  /** LMS-supplied moveOn criterion (defaults to "NotApplicable"). */
  getMoveOn(): CMI5MoveOn {
    return this.#moveOn;
  }

  getState(): SavedState | null {
    return this.#state;
  }

  saveState(state: SavedState): void {
    this.#state = state;
    if (!this.#publisher) return;
    // Chain the State PUT onto the publisher's queue so it lands before
    // Terminated. We can't use sendStatement here (different URL/verb).
    this.#publisher.chainTask(async () => {
      try {
        const resp = await this.#xapiFetch(this.#buildStateUrl(), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(state),
        });
        if (!resp.ok) {
          console.warn(
            `Tessera cmi5: State API PUT returned ${resp.status}; learner progress did not persist.`
          );
        }
      } catch (err) {
        console.warn('Tessera: Failed to save CMI5 state', err);
      }
    });
  }

  setScore(score: number): void {
    this.#score = score;
  }

  setCompletionStatus(status: 'incomplete' | 'complete'): void {
    this.#completionStatus = status;
    if (status !== 'complete' || this.#completedSent || !this.#publisher) return;
    this.#completedSent = true;
    const result: Record<string, unknown> = {
      completion: true,
      duration: formatISO8601Duration(this.#durationSeconds),
    };
    if (this.#score !== null) {
      result.score = { scaled: this.#score / 100 };
    }
    this.#publisher
      .sendStatement({
        verb: { id: VERBS.completed, display: { 'en-US': 'completed' } },
        result,
        context: this.#cmi5Context({ moveOn: true }),
      })
      .catch((err) => {
        console.warn('Tessera cmi5: failed to send Completed statement', err);
      });
    this.#maybeSendSatisfied();
  }

  setSuccessStatus(status: 'passed' | 'failed' | 'unknown'): void {
    if (status === 'unknown' || this.#successSent || !this.#publisher) return;
    this.#successSent = true;
    this.#passed = status === 'passed';

    const verb = status === 'passed' ? VERBS.passed : VERBS.failed;
    const verbName = status === 'passed' ? 'passed' : 'failed';
    const result: Record<string, unknown> = {
      success: status === 'passed',
      duration: formatISO8601Duration(this.#durationSeconds),
    };
    if (this.#score !== null) {
      result.score = { scaled: this.#score / 100 };
    }
    this.#publisher
      .sendStatement({
        verb: { id: verb, display: { 'en-US': verbName } },
        result,
        context: this.#cmi5Context({ moveOn: true }),
      })
      .catch((err) => {
        console.warn(`Tessera cmi5: failed to send ${verbName} statement`, err);
      });
    this.#maybeSendSatisfied();
  }

  setDuration(seconds: number): void {
    this.#durationSeconds = seconds;
  }

  setExit(_mode: 'suspend' | 'normal'): void {
    // cmi5 has no analogue to SCORM cmi.exit; suspend semantics are carried
    // by *not* sending Completed/Terminated yet. No-op.
  }

  reportInteraction(
    questionId: string,
    interaction: Interaction,
    correct: boolean | null
  ): void {
    if (!this.#publisher) return;
    const response = formatResponse(interaction);
    const pattern = formatCorrectPattern(interaction);
    const definition: Record<string, unknown> = {
      type: CMI_INTERACTION_TYPE,
      interactionType: interaction.type,
    };
    if (pattern !== null) {
      definition.correctResponsesPattern = [pattern];
    }
    const result: Record<string, unknown> = { response };
    if (correct !== null) {
      result.success = correct;
    }
    this.#publisher
      .sendStatement({
        verb: { id: VERBS.answered, display: { 'en-US': 'answered' } },
        object: {
          id: `${this.#activityId}#${questionId}`,
          objectType: 'Activity',
          definition,
        },
        result,
      })
      .then((res) => {
        const dest = res.destinations[0];
        if (!dest?.ok) {
          // Publisher resolves successfully even on LRS 4xx/5xx (the
          // failure is in the outcome, not a rejection). Without this
          // log, a rejected Answered statement is invisible to the
          // author — the learner answers a question and the response
          // never appears in the LMS's interaction report.
          console.warn(
            `Tessera cmi5: Answered statement rejected by LRS (${dest?.status ?? 'network error'})`,
            dest?.error
          );
        }
      })
      .catch((err) => {
        console.warn('Tessera cmi5: failed to send Answered statement', err);
      });
  }

  commit(): void {
    // No-op — xAPI calls are sent individually per statement.
  }

  terminate(): void {
    if (this.#terminated) return;
    this.#terminated = true;
    if (!this.#publisher) return;
    // Mark unloading so all subsequent (queued) requests use keepalive,
    // and so the XAPIClient stops accepting new author sends — Terminated
    // must be the last statement of the cmi5 session (§9.3.6).
    this.#publisher.markUnloading();
    const duration = formatISO8601Duration(this.#durationSeconds);
    // cmi5 §10.1: when the AU exits without Completed, send Suspended
    // first so the LMS distinguishes a deliberate pause from abandonment.
    if (!this.#completedSent && this.#completionStatus !== 'complete') {
      this.#publisher
        .sendStatement({
          verb: { id: VERBS.suspended, display: { 'en-US': 'suspended' } },
          result: { duration },
          context: this.#cmi5Context(),
        })
        .catch((err) => {
          console.warn('Tessera cmi5: failed to send Suspended statement', err);
        });
    }
    // cmi5 §9.5.4.1: Terminated MUST include result.duration.
    this.#publisher
      .sendStatement({
        verb: { id: VERBS.terminated, display: { 'en-US': 'terminated' } },
        result: { duration },
        context: this.#cmi5Context(),
      })
      .catch((err) => {
        console.warn('Tessera cmi5: failed to send Terminated statement', err);
      });
  }

  // ---- Private helpers ----

  /**
   * Build the cmi5 context for a Defined Statement. Always emits the
   * "cmi5" Category Activity (§9.6); adds the "moveOn" Category Activity
   * for statements that affect moveOn satisfaction ("completed", "passed",
   * "failed"). Also surfaces the LMS-supplied masteryscore extension when
   * present.
   */
  #cmi5Context(opts: { moveOn?: boolean } = {}): Record<string, unknown> {
    const category: Array<{ id: string; objectType: 'Activity' }> = [
      { id: CMI5_CATEGORY_CMI5, objectType: 'Activity' },
    ];
    if (opts.moveOn) {
      category.push({ id: CMI5_CATEGORY_MOVEON, objectType: 'Activity' });
    }
    const ctx: Record<string, unknown> = {
      contextActivities: { category },
    };
    if (this.#masteryScore !== null) {
      ctx.extensions = { [CMI5_MASTERYSCORE_EXT]: this.#masteryScore };
    }
    return ctx;
  }

  /**
   * cmi5 §9.5.3: when the moveOn criterion has been met, the AU MAY send
   * a Satisfied statement so LMSes that don't compute moveOn themselves
   * still see satisfaction. NotApplicable disables emission entirely.
   */
  #maybeSendSatisfied(): void {
    if (this.#satisfiedSent || !this.#publisher) return;
    if (this.#moveOn === 'NotApplicable') return;

    let satisfied = false;
    switch (this.#moveOn) {
      case 'Passed':
        satisfied = this.#passed;
        break;
      case 'Completed':
        satisfied = this.#completedSent;
        break;
      case 'CompletedAndPassed':
        satisfied = this.#completedSent && this.#passed;
        break;
      case 'CompletedOrPassed':
        satisfied = this.#completedSent || this.#passed;
        break;
    }
    if (!satisfied) return;

    this.#satisfiedSent = true;
    this.#publisher
      .sendStatement({
        verb: { id: VERBS.satisfied, display: { 'en-US': 'satisfied' } },
        result: { duration: formatISO8601Duration(this.#durationSeconds) },
        context: this.#cmi5Context(),
      })
      .catch((err) => {
        console.warn('Tessera cmi5: failed to send Satisfied statement', err);
      });
  }

  #buildStateUrl(): string {
    const agentJson = JSON.stringify(this.#actor);
    const params = new URLSearchParams({
      activityId: this.#activityId,
      agent: agentJson,
      stateId: 'tessera-state',
    });
    // registration is optional per CMI5 spec — omit it when not provided
    if (this.#registration) {
      params.set('registration', this.#registration);
    }
    return `${this.#endpoint}activities/state?${params.toString()}`;
  }

  async #xapiFetch(url: string, options: RequestInit = {}): Promise<Response> {
    const headers = new Headers(options.headers);
    if (this.#authToken) {
      // Basic, not Bearer — cmi5 §6.2 specifies the LMS-issued token is
      // used as a Basic Authorization credential.
      headers.set('Authorization', `Basic ${this.#authToken}`);
    }
    headers.set('X-Experience-API-Version', X_API_VERSION);

    // Mirror the publisher: once the page is unloading, every State API
    // write needs keepalive or the browser will cancel it during teardown.
    // saveState is the suspend payload — losing it costs the resume.
    const keepalive = this.#publisher?.isUnloading() ?? false;
    return fetch(url, {
      ...options,
      headers,
      ...(keepalive ? { keepalive: true } : {}),
    });
  }
}
