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

/** cmi5 §10.2.2 — launch mode dictates which Defined Statements the AU may emit. */
export type CMI5LaunchMode = 'Normal' | 'Browse' | 'Review';
const VALID_LAUNCH_MODE: ReadonlySet<CMI5LaunchMode> = new Set([
  'Normal',
  'Browse',
  'Review',
]);

/** State doc id (cmi5 §10) the LMS pre-populates with launch metadata. */
const LMS_LAUNCH_DATA_STATE_ID = 'LMS.LaunchData';

/** Agent Profile id (cmi5 §11) where the LMS stores learner preferences. */
const CMI5_LEARNER_PREFS_PROFILE_ID = 'cmi5LearnerPreferences';

/** xAPI cmi5 sessionid context extension IRI (cmi5 §9.6.3.1). */
const CMI5_SESSIONID_EXT_IRI =
  'https://w3id.org/xapi/cmi5/context/extensions/sessionid';

/**
 * Shape of the cmi5 `LMS.LaunchData` State document (cmi5 §10). The
 * LMS pre-populates this document before launching the AU; the AU is
 * required to GET it and use `contextTemplate` as the base context on
 * every cmi5 Defined Statement (§9.6.2). The template carries the
 * session id and Publisher Activity that strict LRSes (SCORM Cloud)
 * validate. Other fields cover launch mode (§10.2.2), return URL
 * (§10.2.6), masteryScore (§10.2.4), and the opaque per-launch
 * `launchParameters` string (§10.2.3).
 */
interface CMI5LaunchData {
  contextTemplate?: {
    contextActivities?: {
      category?: Array<{ id: string; objectType?: string }>;
      grouping?: Array<{ id: string }>;
      [k: string]: unknown;
    };
    extensions?: Record<string, unknown>;
    [k: string]: unknown;
  };
  launchMode?: CMI5LaunchMode;
  launchMethod?: 'OwnWindow' | 'AnyWindow';
  launchParameters?: string;
  returnURL?: string;
  masteryScore?: number;
  moveOn?: CMI5MoveOn;
  entitlementKey?: Record<string, string>;
  [k: string]: unknown;
}

/**
 * Shape of the cmi5 Learner Preferences Agent Profile document
 * (cmi5 §11.1). Stored under profile id `cmi5LearnerPreferences`.
 */
interface CMI5LearnerPreferences {
  languagePreference?: string;
  audioPreference?: 'on' | 'off';
  [k: string]: unknown;
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

  // cmi5 §10: the LMS pre-populates the LMS.LaunchData State document
  // with a `contextTemplate`. Per §9.6.2, the AU MUST use that template
  // as the base context on every cmi5 Defined Statement. The template
  // carries the Publisher Activity (in grouping) and the session id —
  // both fields strict LRSes (e.g. SCORM Cloud) validate against. The
  // document also carries launchMode/returnURL/launchParameters/etc.
  // (§10.2), broken out into the dedicated fields below.
  #launchData: CMI5LaunchData | null = null;
  /** cmi5 §10.2.2 — Browse/Review forbid Completed/Passed/Failed/Suspended/Satisfied. */
  #launchMode: CMI5LaunchMode = 'Normal';
  /** cmi5 §10.2.6 — AU SHALL redirect here on terminate when supplied. */
  #returnURL: string | undefined;
  /** cmi5 §10.2.3 — opaque per-launch content config string. */
  #launchParameters: string | undefined;
  /** cmi5 §11 — Learner Preferences Agent Profile document. */
  #learnerPreferences: CMI5LearnerPreferences | null = null;

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
    let token = '';
    if (text.startsWith('{')) {
      try {
        const parsed = JSON.parse(text);
        if (parsed && typeof parsed['auth-token'] === 'string') {
          token = parsed['auth-token'].trim();
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

    // cmi5 §10: GET the LMS.LaunchData State document. This is the
    // *only* spec-defined channel for the session id (§9.6.3.1) and
    // Publisher Activity (§9.6.2.3) the LRS validates statements
    // against. It also carries launchMode (§10.2.2), returnURL
    // (§10.2.6), launchParameters (§10.2.3), and the authoritative
    // masteryScore/moveOn for this launch (§10.2.4/§10.2.5).
    this.#launchData = await this.#fetchLaunchData();
    const tmpl = this.#launchData?.contextTemplate ?? {};
    let sessionId: string | undefined;
    const launchSession = (tmpl.extensions ?? {})[CMI5_SESSIONID_EXT_IRI];
    if (typeof launchSession === 'string' && launchSession.trim()) {
      sessionId = launchSession.trim();
    }
    if (this.#launchData) {
      // launchMode default is "Normal" (§10.2.2). Validate before honoring.
      if (
        typeof this.#launchData.launchMode === 'string' &&
        VALID_LAUNCH_MODE.has(this.#launchData.launchMode)
      ) {
        this.#launchMode = this.#launchData.launchMode;
      }
      if (
        typeof this.#launchData.returnURL === 'string' &&
        this.#launchData.returnURL
      ) {
        this.#returnURL = this.#launchData.returnURL;
      }
      if (typeof this.#launchData.launchParameters === 'string') {
        this.#launchParameters = this.#launchData.launchParameters;
      }
      // cmi5 §10.2.4 — LaunchData.masteryScore is the authoritative
      // source. The URL `masteryScore` parsed earlier is non-standard
      // and only kept as a fallback. LaunchData wins when present.
      if (
        typeof this.#launchData.masteryScore === 'number' &&
        Number.isFinite(this.#launchData.masteryScore) &&
        this.#launchData.masteryScore >= 0 &&
        this.#launchData.masteryScore <= 1
      ) {
        this.#masteryScore = this.#launchData.masteryScore;
      }
      // moveOn likewise: LaunchData is authoritative when present.
      if (
        typeof this.#launchData.moveOn === 'string' &&
        VALID_MOVE_ON.has(this.#launchData.moveOn)
      ) {
        this.#moveOn = this.#launchData.moveOn;
      }
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

    // cmi5 §9.3.2 — Initialized SHOULD follow launch within a reasonable
    // period. Queue it before the (potentially slow) resume State GET
    // and Learner Preferences fetch so a slow LRS can't push it past
    // the 30-second window strict LMSes enforce. The publisher queue
    // still keeps it ordered before any later Defined Statement.
    this.#publisher
      .sendStatement({
        verb: { id: VERBS.initialized, display: { 'en-US': 'initialized' } },
        context: this.#cmi5Context(),
      })
      .catch((err) => {
        console.warn('Tessera cmi5: failed to send Initialized statement', err);
      });

    // cmi5 §11 — fetch the Learner Preferences Agent Profile document.
    // Non-fatal; missing prefs just means defaults.
    this.#learnerPreferences = await this.#fetchLearnerPreferences();

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

  /**
   * LMS-supplied launch mode (cmi5 §10.2.2). "Normal" is the default
   * and the only mode where progress-bearing Defined Statements
   * (Completed / Passed / Failed / Suspended / Satisfied) are
   * permitted. "Browse" and "Review" launches MUST NOT emit them.
   */
  getLaunchMode(): CMI5LaunchMode {
    return this.#launchMode;
  }

  /**
   * LMS-supplied URL to navigate to when the AU terminates
   * (cmi5 §10.2.6). Use `exit()` for the spec-conformant Terminated +
   * redirect sequence; this getter is for authors who want to inspect
   * the URL without triggering exit, or who need to integrate
   * redirection into a custom shutdown flow.
   */
  getReturnURL(): string | undefined {
    return this.#returnURL;
  }

  /**
   * LMS-supplied opaque content-config string for this launch
   * (cmi5 §10.2.3). Authors interpret the value however the LMS
   * configured it (e.g. JSON, query string, key=value pairs).
   */
  getLaunchParameters(): string | undefined {
    return this.#launchParameters;
  }

  /**
   * Learner Preferences (cmi5 §11.1) — `audioPreference` and
   * `languagePreference` are common keys. Returns null when the LMS
   * didn't provide a preferences document.
   */
  getLearnerPreferences(): CMI5LearnerPreferences | null {
    return this.#learnerPreferences;
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
    // cmi5 §9.5.1 / xAPI: `score.scaled` is a decimal in [0, 1]. We
    // accept percentage in (the project-internal) 0–100 range and
    // clamp out-of-range values so an over- or under-eager author
    // call can't produce a statement the LRS will reject. Out-of-band
    // values are clamped silently — the alternative (rejecting the
    // setter) breaks resume math elsewhere in the runtime.
    if (!Number.isFinite(score)) {
      this.#score = null;
      return;
    }
    this.#score = Math.max(0, Math.min(100, score));
  }

  setCompletionStatus(status: 'incomplete' | 'complete'): void {
    this.#completionStatus = status;
    if (status !== 'complete' || this.#completedSent || !this.#publisher) return;
    // cmi5 §10.2.2 — Browse/Review launches MUST NOT emit Completed.
    if (this.#launchMode !== 'Normal') return;
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
    // cmi5 §10.2.2 — Browse/Review launches MUST NOT emit Passed/Failed.
    if (this.#launchMode !== 'Normal') return;
    this.#successSent = true;
    this.#passed = status === 'passed';

    const verb = status === 'passed' ? VERBS.passed : VERBS.failed;
    const verbName = status === 'passed' ? 'passed' : 'failed';
    const result: Record<string, unknown> = {
      success: status === 'passed',
      duration: formatISO8601Duration(this.#durationSeconds),
    };
    if (this.#score !== null) {
      const scaled = this.#score / 100;
      // cmi5 §9.3.4: a `passed` statement carrying a scaled score MUST
      // have scaled >= masteryScore. Sending a Passed below threshold
      // produces a non-conformant statement; rather than refuse the
      // verb (the author asserted it), we omit the score and warn.
      // Failed is unconstrained.
      if (
        status === 'passed' &&
        this.#masteryScore !== null &&
        scaled < this.#masteryScore
      ) {
        console.warn(
          `Tessera cmi5: refusing to attach scaled score ${scaled.toFixed(3)} to Passed ` +
            `(masteryScore=${this.#masteryScore}); per cmi5 §9.3.4 a Passed with a score must satisfy mastery. ` +
            `Statement will be sent without a score.`
        );
      } else {
        result.score = { scaled };
      }
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
    // cmi5 §10.2.2: Browse/Review MUST NOT emit Suspended either.
    if (
      this.#launchMode === 'Normal' &&
      !this.#completedSent &&
      this.#completionStatus !== 'complete'
    ) {
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

  /**
   * cmi5 §10.2.6: the AU SHALL redirect the current browser window to
   * `returnURL` when terminated. `terminate()` runs synchronously
   * during pagehide/beforeunload where redirects are unreliable; this
   * `exit()` method is the explicit-Exit path. It calls `terminate()`,
   * awaits the publisher's queue so Terminated lands before navigation,
   * and then redirects.
   *
   * No-ops the redirect (but still terminates) when the LMS didn't
   * provide a returnURL — that's a legitimate launch configuration.
   */
  async exit(): Promise<void> {
    this.terminate();
    if (this.#publisher) {
      // chainTask returns a promise that resolves after the previous
      // queue head (Suspended/Terminated) drains, regardless of HTTP
      // outcome — exactly the ordering we need before navigating away.
      try {
        await this.#publisher.chainTask(async () => {});
      } catch {
        // chainTask never rejects, but defend against publisher
        // refactors. Failing to flush shouldn't block the redirect.
      }
    }
    if (this.#returnURL && typeof window !== 'undefined') {
      window.location.assign(this.#returnURL);
    }
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
    // Start from the LMS's contextTemplate (cmi5 §9.6.2) — Publisher
    // Activity in grouping, session id extension, any LMS extras. The
    // spec is explicit (§10.2.1) that the AU MUST NOT overwrite these.
    const tmpl = this.#launchData?.contextTemplate ?? {};
    const tmplActivities = (tmpl.contextActivities ?? {}) as Record<string, unknown>;

    // Per-verb category requirements:
    //   - cmi5 Category Activity on every Defined Statement (§9.6.2.1)
    //   - moveOn Category Activity on Completed/Passed/Failed (§9.6.2.2)
    // Concatenate with whatever the template supplied and dedupe by id
    // so the spec's "MUST NOT overwrite" rule holds even if the LMS
    // pre-populated a category list of its own.
    const seen = new Set<string>();
    const category: Array<{ id: string; objectType: string }> = [];
    const push = (id: string) => {
      if (!seen.has(id)) {
        seen.add(id);
        category.push({ id, objectType: 'Activity' });
      }
    };
    const templateCategory = Array.isArray((tmplActivities as { category?: unknown }).category)
      ? ((tmplActivities as { category: Array<{ id: string; objectType?: string }> }).category)
      : [];
    for (const c of templateCategory) {
      if (c && typeof c.id === 'string') push(c.id);
    }
    push(CMI5_CATEGORY_CMI5);
    if (opts.moveOn) push(CMI5_CATEGORY_MOVEON);

    const contextActivities: Record<string, unknown> = {
      ...tmplActivities,
      category,
    };

    const ctx: Record<string, unknown> = {
      ...(tmpl as Record<string, unknown>),
      contextActivities,
    };
    // Surface the LMS-supplied mastery score extension on Defined
    // Statements that carry score/completion. cmi5 §9.6.3.2 puts this
    // on Completed/Passed/Failed; we add it whenever it's known and
    // merge with any template-supplied extensions.
    if (this.#masteryScore !== null) {
      ctx.extensions = {
        ...((tmpl.extensions ?? {}) as Record<string, unknown>),
        [CMI5_MASTERYSCORE_EXT]: this.#masteryScore,
      };
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
    // cmi5 §10.2.2 — only Initialized/Terminated are allowed outside Normal.
    if (this.#launchMode !== 'Normal') return;
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

  #buildStateUrl(stateId: string = 'tessera-state'): string {
    const agentJson = JSON.stringify(this.#actor);
    const params = new URLSearchParams({
      activityId: this.#activityId,
      agent: agentJson,
      stateId,
    });
    // registration is optional per CMI5 spec — omit it when not provided
    if (this.#registration) {
      params.set('registration', this.#registration);
    }
    return `${this.#endpoint}activities/state?${params.toString()}`;
  }

  /**
   * Build the Agent Profile API URL for a given profileId. cmi5 §11
   * scopes the Learner Preferences document by agent only (no activity
   * or registration), so the URL omits both.
   */
  #buildAgentProfileUrl(profileId: string): string {
    const agentJson = JSON.stringify(this.#actor);
    const params = new URLSearchParams({
      agent: agentJson,
      profileId,
    });
    return `${this.#endpoint}agents/profile?${params.toString()}`;
  }

  /**
   * GET the cmi5 `LMS.LaunchData` State document. The LMS pre-populates
   * this doc (cmi5 §10) with a `contextTemplate` the AU MUST use as the
   * base context on every cmi5 Defined Statement, plus launchMode,
   * returnURL, launchParameters, masteryScore, and moveOn (§10.2).
   * Returns null when the document is absent or unparseable; the
   * caller logs a warning, since a missing LaunchData document
   * indicates a non-conformant LMS and statements will likely fail.
   */
  async #fetchLaunchData(): Promise<CMI5LaunchData | null> {
    try {
      const url = this.#buildStateUrl(LMS_LAUNCH_DATA_STATE_ID);
      const resp = await this.#xapiFetch(url, { method: 'GET' });
      if (resp.ok) {
        return (await resp.json()) as CMI5LaunchData;
      }
      console.warn(
        `Tessera cmi5: LMS.LaunchData State GET returned ${resp.status}; ` +
          'cmi5 Defined Statements may be rejected by strict LRSes ' +
          '(missing Publisher Activity / session id).'
      );
    } catch (err) {
      console.warn(
        `Tessera cmi5: LMS.LaunchData State GET failed (${err instanceof Error ? err.message : String(err)}).`
      );
    }
    return null;
  }

  /**
   * GET the cmi5 Learner Preferences Agent Profile document (cmi5 §11).
   * Stored under profile id `cmi5LearnerPreferences`, scoped to the
   * agent. Returns null when the LMS hasn't published one (a 404 is
   * normal, not an error) — authors fall back to course defaults.
   */
  async #fetchLearnerPreferences(): Promise<CMI5LearnerPreferences | null> {
    try {
      const url = this.#buildAgentProfileUrl(CMI5_LEARNER_PREFS_PROFILE_ID);
      const resp = await this.#xapiFetch(url, { method: 'GET' });
      if (resp.ok) {
        return (await resp.json()) as CMI5LearnerPreferences;
      }
      if (resp.status !== 404) {
        console.warn(
          `Tessera cmi5: Agent Profile GET (cmi5LearnerPreferences) returned ${resp.status}.`
        );
      }
    } catch (err) {
      console.warn(
        `Tessera cmi5: Agent Profile GET (cmi5LearnerPreferences) failed (${err instanceof Error ? err.message : String(err)}).`
      );
    }
    return null;
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
