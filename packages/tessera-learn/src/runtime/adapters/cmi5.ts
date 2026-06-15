import { parseScaled01 } from './format.js';
import { BaseXAPILaunchAdapter } from './xapi-launch-base.js';

const CMI5_MASTERYSCORE_EXT =
  'https://w3id.org/xapi/cmi5/context/extensions/masteryscore';

// cmi5 §9.6 — every cmi5 Defined Statement MUST carry the "cmi5" Category
// Activity in context.contextActivities.category, and "completed", "passed",
// "failed" MUST additionally carry the "moveOn" Category. Without these, an
// LRS will accept the statement as an arbitrary xAPI verb but won't roll it
// up into cmi5 lifecycle state — the LMS never sees the AU as completed.
const CMI5_CATEGORY_CMI5 = 'https://w3id.org/xapi/cmi5/context/categories/cmi5';
const CMI5_CATEGORY_MOVEON =
  'https://w3id.org/xapi/cmi5/context/categories/moveon';

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
  returnURL?: string;
  masteryScore?: number;
  entitlementKey?: Record<string, string>;
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
 * The version-neutral launch lifecycle lives in BaseXAPILaunchAdapter; this
 * class layers cmi5 specifics on top: fetch-token auth, LMS.LaunchData, the
 * cmi5 context (Category/moveOn/masteryScore), launch-mode gating, and the
 * Agent Profile GET.
 */
export class CMI5Adapter extends BaseXAPILaunchAdapter {
  // cmi5 §8 launch params. masteryScore (when present) overrides the
  // course's manifest passingScore for this launch — the LMS is the authority.
  #masteryScore: number | null = null;

  // cmi5 §10 LMS.LaunchData. `contextTemplate` is the AU's base context
  // (§9.6.2) — Publisher Activity and session id live there, and strict
  // LRSes validate every Defined Statement against it.
  #launchData: CMI5LaunchData | null = null;
  /** cmi5 §10.2.2 — Browse/Review forbid every Defined Statement except Initialized/Terminated. */
  #launchMode: CMI5LaunchMode = 'Normal';

  async init(): Promise<void> {
    this.version = '1.0.3';
    this.logName = 'cmi5';
    const params = new URLSearchParams(window.location.search);
    const fetchUrl = params.get('fetch');
    // Normalize endpoint to always have a trailing slash so URL concatenation is safe
    this.endpoint = (params.get('endpoint') || '').replace(/\/?$/, '/');
    const reg = params.get('registration') || '';
    // xAPI requires `context.registration` to be a UUID; sending an empty
    // string makes LRSes 400. Omit when the LMS didn't provide one.
    this.registration = reg ? reg : undefined;
    this.activityId = params.get('activityId') || '';

    const rawMastery = params.get('masteryScore');
    if (rawMastery !== null && rawMastery !== '') {
      const m = parseScaled01(rawMastery);
      if (m !== null) {
        this.#masteryScore = m;
      } else {
        console.warn(
          `Tessera cmi5: launch parameter 'masteryScore' is not a decimal in [0,1] (got "${rawMastery}"); ignoring.`,
        );
      }
    }

    // Malformed actor JSON is a launch-time failure: an empty {} actor
    // would fail every Identified-Agent check downstream and produce
    // confusing 400s on every send. Fail loud here instead.
    this.parseActorParam(params.get('actor') || '');

    // The cmi5 fetch URL is single-use (§6.2): if it fails we can't retry,
    // and continuing with no token will 401-loop until auth is marked dead.
    // Fail loud at launch instead of dribbling errors per statement.
    if (!fetchUrl) {
      throw new Error(
        "Tessera cmi5: launch parameter 'fetch' is missing. Cannot acquire LMS auth token.",
      );
    }
    let resp: Response;
    try {
      resp = await fetch(fetchUrl, { method: 'POST' });
    } catch (err) {
      throw new Error(
        `Tessera cmi5: fetch token request failed (${err instanceof Error ? err.message : String(err)}). The cmi5 launch fetch URL is single-use; reload from the LMS to retry.`,
        { cause: err },
      );
    }
    if (!resp.ok) {
      throw new Error(
        `Tessera cmi5: fetch token request returned ${resp.status}. The cmi5 launch fetch URL is single-use; reload from the LMS to retry.`,
      );
    }
    const text = (await resp.text()).trim();
    // cmi5 §11.2 — response is `{"auth-token": "..."}`. Some
    // non-conformant LMSes return bare text with an `auth-token=`
    // prefix, so we fall back to that. The token value is the literal
    // Basic credential (already base64); we don't re-encode.
    let token = '';
    if (text.startsWith('{')) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = undefined;
      }
      if (parsed && typeof parsed === 'object') {
        const obj = parsed as Record<string, unknown>;
        if (typeof obj['auth-token'] === 'string') {
          token = (obj['auth-token'] as string).trim();
        } else {
          const code =
            typeof obj['error-code'] === 'string'
              ? obj['error-code']
              : undefined;
          const errText =
            typeof obj['error-text'] === 'string'
              ? obj['error-text']
              : undefined;
          const detail =
            code !== undefined || errText !== undefined
              ? ` (error-code=${code ?? 'unknown'}${errText ? `: ${errText}` : ''})`
              : '';
          throw new Error(
            `Tessera cmi5: fetch URL returned a JSON response without an 'auth-token' field${detail}. ` +
              'The cmi5 fetch URL is single-use (§8.2.3.1); reload from the LMS to obtain a fresh launch.',
          );
        }
      }
    }
    if (!token) {
      token = text.replace(/^auth-token=/, '').trim();
    }
    this.authToken = token;
    if (!this.authToken) {
      throw new Error(
        'Tessera cmi5: fetch token request returned an empty token. Expected a JSON body of the form {"auth-token": "..."}.',
      );
    }

    // cmi5 §10 — LaunchData is the only spec-defined channel for the
    // session id (§9.6.3.1) and Publisher Activity (§9.6.2.3) the LRS
    // validates against, plus launchMode/returnURL/masteryScore (§10.2).
    // LaunchData values override the URL masteryScore parsed earlier
    // (§10.2.4 makes it authoritative).
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
        this.returnURL = this.#launchData.returnURL;
      }
      const launchMastery = parseScaled01(this.#launchData.masteryScore);
      if (launchMastery !== null) {
        this.#masteryScore = launchMastery;
      }
    }

    // cmi5 §11 — fetch the Agent Profile BEFORE Initialized. Strict
    // LRSes track the GET and reject Initialized otherwise. A 404 here
    // is legitimate (no prefs set); the GET itself is what's required.
    await this.#fetchLearnerPreferences();

    const publisher = this.createPublisher({ sessionId, cmi5Mode: true });
    await publisher.init();

    // cmi5 §9.3.2 — queue Initialized before the resume State GET so a
    // slow LRS can't push it past the spec's "reasonable period". The
    // publisher queue keeps it ordered before any later Defined Statement.
    this.sendInitialized();

    await this.loadResumeState();
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

  /** cmi5 §10.2.2 — "Normal" is the only mode where progress-bearing Defined Statements are permitted. */
  getLaunchMode(): CMI5LaunchMode {
    return this.#launchMode;
  }

  /** cmi5 §10.2.2 — Browse/Review forbid Completed/Passed/Failed. */
  protected isDefinedStatementAllowed(): boolean {
    return this.#launchMode === 'Normal';
  }

  /**
   * cmi5 §9.3.4 / §9.3.5 — Passed-with-score requires scaled >=
   * masteryScore; Failed-with-score requires scaled < masteryScore. The
   * author asserted the verb, so on contradiction keep the verb and drop
   * the score (and warn).
   */
  protected scoreForSuccess(status: 'passed' | 'failed'): number | null {
    if (this.score === null) return null;
    const scaled = this.score / 100;
    if (this.#masteryScore !== null) {
      const violatesPassed = status === 'passed' && scaled < this.#masteryScore;
      const violatesFailed =
        status === 'failed' && scaled >= this.#masteryScore;
      if (violatesPassed || violatesFailed) {
        console.warn(
          `Tessera cmi5: refusing to attach scaled score ${scaled.toFixed(3)} to ` +
            `${status === 'passed' ? 'Passed' : 'Failed'} (masteryScore=${this.#masteryScore}); ` +
            `per cmi5 §9.3.${status === 'passed' ? '4' : '5'} the score would contradict the verb. ` +
            `Statement will be sent without a score.`,
        );
        return null;
      }
    }
    return scaled;
  }

  /**
   * Build the cmi5 context for a Defined Statement, starting from the
   * LMS contextTemplate (§9.6.2 — AU MUST NOT overwrite). Adds the
   * cmi5 Category Activity (§9.6.2.1), the moveOn Category for
   * Completed/Passed/Failed (§9.6.2.2), and the masteryScore extension
   * for Passed/Failed (§9.6.3.2).
   */
  protected buildContext(
    opts: { moveOn?: boolean; mastery?: boolean } = {},
  ): Record<string, unknown> {
    const tmpl = this.#launchData?.contextTemplate ?? {};
    const tmplActivities = tmpl.contextActivities ?? {};

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
    const templateCategory = Array.isArray(tmplActivities.category)
      ? tmplActivities.category
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
      ...tmpl,
      contextActivities,
    };
    // cmi5 §9.6.3.2 — masteryScore extension is scoped to Passed/Failed.
    if (opts.mastery && this.#masteryScore !== null) {
      ctx.extensions = {
        ...(tmpl.extensions ?? {}),
        [CMI5_MASTERYSCORE_EXT]: this.#masteryScore,
      };
    }
    return ctx;
  }

  /** cmi5 §11 — Agent Profile URL. Scoped to agent only (no activity/registration). */
  #buildAgentProfileUrl(profileId: string): string {
    const agentJson = JSON.stringify(this.actor);
    const params = new URLSearchParams({
      agent: agentJson,
      profileId,
    });
    return `${this.endpoint}agents/profile?${params.toString()}`;
  }

  /** GET the cmi5 §10 `LMS.LaunchData` document. Null if absent — strict LRSes will then reject Defined Statements. */
  async #fetchLaunchData(): Promise<CMI5LaunchData | null> {
    try {
      const url = this.buildStateUrl(LMS_LAUNCH_DATA_STATE_ID);
      const resp = await this.xapiFetch(url, { method: 'GET' });
      if (resp.ok) {
        return (await resp.json()) as CMI5LaunchData;
      }
      console.warn(
        `Tessera cmi5: LMS.LaunchData State GET returned ${resp.status}; ` +
          'cmi5 Defined Statements may be rejected by strict LRSes ' +
          '(missing Publisher Activity / session id).',
      );
    } catch (err) {
      console.warn(
        `Tessera cmi5: LMS.LaunchData State GET failed (${err instanceof Error ? err.message : String(err)}).`,
      );
    }
    return null;
  }

  /**
   * GET cmi5 §11.1 Learner Preferences. The GET itself is the §11
   * obligation (it must precede Initialized); the response body is not
   * consumed. 404 is normal (no prefs set).
   */
  async #fetchLearnerPreferences(): Promise<void> {
    try {
      const url = this.#buildAgentProfileUrl(CMI5_LEARNER_PREFS_PROFILE_ID);
      const resp = await this.xapiFetch(url, { method: 'GET' });
      if (!resp.ok && resp.status !== 404) {
        console.warn(
          `Tessera cmi5: Agent Profile GET (cmi5LearnerPreferences) returned ${resp.status}.`,
        );
      }
    } catch (err) {
      console.warn(
        `Tessera cmi5: Agent Profile GET (cmi5LearnerPreferences) failed (${err instanceof Error ? err.message : String(err)}).`,
      );
    }
  }
}
