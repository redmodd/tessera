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
  terminated: 'http://adlnet.gov/expapi/verbs/terminated',
  // Intentionally absent: "satisfied" (LMS-only, §9.3.9) and
  // "suspended" (not a cmi5-defined verb — §9.3 enumerates nine, none
  // of them Suspended). The LMS infers Abandoned vs resume from
  // registration state when Terminated lands without Completed.
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

/** cmi5 §10 `LMS.LaunchData` document. `contextTemplate` is the base context for every Defined Statement (§9.6.2). */
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

/** cmi5 §11.1 Learner Preferences Agent Profile document. */
interface CMI5LearnerPreferences {
  languagePreference?: string;
  audioPreference?: 'on' | 'off';
  [k: string]: unknown;
}

/** `.then` handler that warns on LRS non-2xx. Publisher resolves successfully on 4xx/5xx (failure is in the outcome), so `.catch` alone misses them. */
function warnOnLRSReject(
  verbName: string
): (res: { destinations?: Array<{ ok?: boolean; status?: number; error?: Error }> }) => void {
  return (res) => {
    const dest = res.destinations?.[0];
    if (dest && !dest.ok) {
      console.warn(
        `Tessera cmi5: ${verbName} statement rejected by LRS (${dest.status ?? 'network error'})`,
        dest.error
      );
    }
  };
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
  #successSent = false;
  #terminated = false;

  // cmi5 §8 launch params. masteryScore (when present) overrides the
  // course's manifest passingScore for this launch — the LMS is the
  // authority. moveOn drives the optional Satisfied statement (§9.5.3).
  #masteryScore: number | null = null;
  #moveOn: CMI5MoveOn = 'NotApplicable';

  // cmi5 §10 LMS.LaunchData. `contextTemplate` is the AU's base context
  // (§9.6.2) — Publisher Activity and session id live there, and strict
  // LRSes validate every Defined Statement against it.
  #launchData: CMI5LaunchData | null = null;
  /** cmi5 §10.2.2 — Browse/Review forbid every Defined Statement except Initialized/Terminated. */
  #launchMode: CMI5LaunchMode = 'Normal';
  /** cmi5 §10.2.6 — AU redirects here on `exit()`. */
  #returnURL: string | undefined;
  /** cmi5 §10.2.3 — opaque per-launch content config string. */
  #launchParameters: string | undefined;
  /** cmi5 §11.1 Learner Preferences. */
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
    // cmi5 §11.2 — response is `{"auth-token": "..."}`. Some
    // non-conformant LMSes return bare text with an `auth-token=`
    // prefix, so we fall back to that. The token value is the literal
    // Basic credential (already base64); we don't re-encode.
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

    // cmi5 §10 — LaunchData is the only spec-defined channel for the
    // session id (§9.6.3.1) and Publisher Activity (§9.6.2.3) the LRS
    // validates against, plus launchMode/returnURL/launchParameters/
    // masteryScore/moveOn (§10.2). LaunchData values override the URL
    // masteryScore parsed earlier (§10.2.4 makes it authoritative).
    this.#launchData = await this.#fetchLaunchData();
    const tmpl = this.#launchData?.contextTemplate ?? {};
    let sessionId: string | undefined;
    const launchSession = (tmpl.extensions ?? {})[CMI5_SESSIONID_EXT_IRI];
    if (typeof launchSession === 'string' && launchSession.trim()) {
      sessionId = launchSession.trim();
    }
    if (this.#launchData) {
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
      if (
        typeof this.#launchData.masteryScore === 'number' &&
        Number.isFinite(this.#launchData.masteryScore) &&
        this.#launchData.masteryScore >= 0 &&
        this.#launchData.masteryScore <= 1
      ) {
        this.#masteryScore = this.#launchData.masteryScore;
      }
      if (
        typeof this.#launchData.moveOn === 'string' &&
        VALID_MOVE_ON.has(this.#launchData.moveOn)
      ) {
        this.#moveOn = this.#launchData.moveOn;
      }
    }

    // cmi5 §11 — fetch the Agent Profile BEFORE Initialized. Strict
    // LRSes track the GET and reject Initialized otherwise. A 404 here
    // is legitimate (no prefs set); the GET itself is what's required.
    this.#learnerPreferences = await this.#fetchLearnerPreferences();

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

    // cmi5 §9.3.2 — queue Initialized before the resume State GET so a
    // slow LRS can't push it past the spec's "reasonable period". The
    // publisher queue keeps it ordered before any later Defined Statement.
    this.#publisher
      .sendStatement({
        verb: { id: VERBS.initialized, display: { 'en-US': 'initialized' } },
        context: this.#cmi5Context(),
      })
      .then(warnOnLRSReject('Initialized'))
      .catch((err) => {
        console.warn('Tessera cmi5: failed to send Initialized statement', err);
      });

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

  /** cmi5 §10.2.2 — "Normal" is the only mode where progress-bearing Defined Statements are permitted. */
  getLaunchMode(): CMI5LaunchMode {
    return this.#launchMode;
  }

  /** cmi5 §10.2.6 — URL the AU navigates to on `exit()`. Returns undefined when the LMS didn't supply one. */
  getReturnURL(): string | undefined {
    return this.#returnURL;
  }

  /** cmi5 §10.2.3 — opaque per-launch content-config string. */
  getLaunchParameters(): string | undefined {
    return this.#launchParameters;
  }

  /** cmi5 §11.1 Learner Preferences. Null when the LMS didn't publish one. */
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
    // Clamped to [0, 100] so the /100 division yields a spec-legal
    // scaled value in [0, 1] (xAPI).
    if (!Number.isFinite(score)) {
      this.#score = null;
      return;
    }
    this.#score = Math.max(0, Math.min(100, score));
  }

  setCompletionStatus(status: 'incomplete' | 'complete'): void {
    if (status !== 'complete' || this.#completedSent || !this.#publisher) return;
    // cmi5 §10.2.2 — Browse/Review launches MUST NOT emit Completed.
    if (this.#launchMode !== 'Normal') return;
    this.#completedSent = true;
    // cmi5 §9.5.1 — `score` MUST NOT appear on Completed (Passed/Failed only).
    const result: Record<string, unknown> = {
      completion: true,
      duration: formatISO8601Duration(this.#durationSeconds),
    };
    this.#publisher
      .sendStatement({
        verb: { id: VERBS.completed, display: { 'en-US': 'completed' } },
        result,
        context: this.#cmi5Context({ moveOn: true }),
      })
      .then(warnOnLRSReject('Completed'))
      .catch((err) => {
        console.warn('Tessera cmi5: failed to send Completed statement', err);
      });
  }

  setSuccessStatus(status: 'passed' | 'failed' | 'unknown'): void {
    if (status === 'unknown' || this.#successSent || !this.#publisher) return;
    // cmi5 §10.2.2 — Browse/Review launches MUST NOT emit Passed/Failed.
    if (this.#launchMode !== 'Normal') return;
    this.#successSent = true;

    const verb = status === 'passed' ? VERBS.passed : VERBS.failed;
    const verbName = status === 'passed' ? 'passed' : 'failed';
    const result: Record<string, unknown> = {
      success: status === 'passed',
      duration: formatISO8601Duration(this.#durationSeconds),
    };
    if (this.#score !== null) {
      const scaled = this.#score / 100;
      // cmi5 §9.3.4 / §9.3.5 — Passed-with-score requires scaled >=
      // masteryScore; Failed-with-score requires scaled < masteryScore.
      // The author asserted the verb, so on contradiction we keep the
      // verb and drop the score (and warn).
      if (this.#masteryScore !== null) {
        const violatesPassed = status === 'passed' && scaled < this.#masteryScore;
        const violatesFailed = status === 'failed' && scaled >= this.#masteryScore;
        if (violatesPassed || violatesFailed) {
          console.warn(
            `Tessera cmi5: refusing to attach scaled score ${scaled.toFixed(3)} to ` +
              `${status === 'passed' ? 'Passed' : 'Failed'} (masteryScore=${this.#masteryScore}); ` +
              `per cmi5 §9.3.${status === 'passed' ? '4' : '5'} the score would contradict the verb. ` +
              `Statement will be sent without a score.`
          );
        } else {
          result.score = { scaled };
        }
      } else {
        result.score = { scaled };
      }
    }
    this.#publisher
      .sendStatement({
        verb: { id: verb, display: { 'en-US': verbName } },
        result,
        context: this.#cmi5Context({ moveOn: true, mastery: true }),
      })
      .then(warnOnLRSReject(verbName === 'passed' ? 'Passed' : 'Failed'))
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
      .then(warnOnLRSReject('Answered'))
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
    // No Suspended — cmi5 doesn't define that verb (§9.3); the LMS
    // handles resume vs Abandoned itself when a new session opens
    // against an active registration (§9.3.6).
    // cmi5 §9.5.4.1 — Terminated MUST include result.duration.
    this.#publisher
      .sendStatement({
        verb: { id: VERBS.terminated, display: { 'en-US': 'terminated' } },
        result: { duration },
        context: this.#cmi5Context(),
      })
      .then(warnOnLRSReject('Terminated'))
      .catch((err) => {
        console.warn('Tessera cmi5: failed to send Terminated statement', err);
      });
  }

  /**
   * cmi5 §10.2.6 — explicit-Exit path. Terminate, wait for the
   * publisher queue to drain so Terminated lands first, then redirect
   * to `returnURL`. `terminate()` alone (called from pagehide) can't
   * redirect — the page is already unloading.
   */
  async exit(): Promise<void> {
    this.terminate();
    if (this.#publisher) {
      // chainTask with a no-op task awaits the queue head.
      try {
        await this.#publisher.chainTask(async () => {});
      } catch {
        // never rejects today; don't let a refactor block redirect.
      }
    }
    if (this.#returnURL && typeof window !== 'undefined') {
      window.location.assign(this.#returnURL);
    }
  }

  // ---- Private helpers ----

  /**
   * Build the cmi5 context for a Defined Statement, starting from the
   * LMS contextTemplate (§9.6.2 — AU MUST NOT overwrite). Adds the
   * cmi5 Category Activity (§9.6.2.1), the moveOn Category for
   * Completed/Passed/Failed (§9.6.2.2), and the masteryScore extension
   * for Passed/Failed (§9.6.3.2).
   */
  #cmi5Context(
    opts: { moveOn?: boolean; mastery?: boolean } = {}
  ): Record<string, unknown> {
    const tmpl = this.#launchData?.contextTemplate ?? {};
    const tmplActivities = (tmpl.contextActivities ?? {}) as Record<string, unknown>;

    // Concat-dedupe category to preserve any template-supplied entries
    // (§10.2.1 forbids overwriting them).
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
    // cmi5 §9.6.3.2 — masteryScore extension is scoped to Passed/Failed.
    if (opts.mastery && this.#masteryScore !== null) {
      ctx.extensions = {
        ...((tmpl.extensions ?? {}) as Record<string, unknown>),
        [CMI5_MASTERYSCORE_EXT]: this.#masteryScore,
      };
    }
    return ctx;
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

  /** cmi5 §11 — Agent Profile URL. Scoped to agent only (no activity/registration). */
  #buildAgentProfileUrl(profileId: string): string {
    const agentJson = JSON.stringify(this.#actor);
    const params = new URLSearchParams({
      agent: agentJson,
      profileId,
    });
    return `${this.#endpoint}agents/profile?${params.toString()}`;
  }

  /** GET the cmi5 §10 `LMS.LaunchData` document. Null if absent — strict LRSes will then reject Defined Statements. */
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

  /** GET cmi5 §11.1 Learner Preferences. 404 is normal (no prefs set). */
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
