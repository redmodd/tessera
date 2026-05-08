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
} as const;

const CMI_INTERACTION_TYPE = 'http://adlnet.gov/expapi/activities/cmi.interaction';

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
  #terminated = false;

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
    const text = await resp.text();
    // The fetch URL returns the token, possibly with "auth-token=" prefix
    // (cmi5 §6.2). The credential itself is the value used as the
    // "Basic" Authorization header — NOT a Bearer token.
    this.#authToken = text.replace(/^auth-token=/, '').trim();
    if (!this.#authToken) {
      throw new Error(
        'Tessera cmi5: fetch token request returned an empty body. Expected an "auth-token=..." or bare token.'
      );
    }

    this.#publisher = new XAPIPublisher({
      endpoint: this.#endpoint,
      auth: this.#authToken,
      actor: this.#actor,
      activityId: this.#activityId,
      registration: this.#registration,
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
      }
    } catch {
      this.#state = null;
    }

    // Send Initialized statement (queued through publisher). Log failures
    // here too — the publisher's per-destination outcome covers transport
    // errors but won't surface to console; lifecycle statements are rare
    // enough that an explicit warning helps production triage.
    await this.#publisher
      .sendStatement({
        verb: { id: VERBS.initialized, display: { 'en-US': 'initialized' } },
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
        await this.#xapiFetch(this.#buildStateUrl(), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(state),
        });
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
      })
      .catch((err) => {
        console.warn('Tessera cmi5: failed to send Completed statement', err);
      });
  }

  setSuccessStatus(status: 'passed' | 'failed' | 'unknown'): void {
    if (status === 'unknown' || this.#successSent || !this.#publisher) return;
    this.#successSent = true;

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
      })
      .catch((err) => {
        console.warn(`Tessera cmi5: failed to send ${verbName} statement`, err);
      });
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
      .catch(() => {});
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
      })
      .catch((err) => {
        console.warn('Tessera cmi5: failed to send Terminated statement', err);
      });
  }

  // ---- Private helpers ----

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
