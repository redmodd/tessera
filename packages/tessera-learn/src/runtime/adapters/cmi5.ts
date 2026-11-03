import { parseMastery } from './format.js';
import { BaseXAPILaunchAdapter } from './xapi-launch-base.js';
import { CMI5_SESSIONID_EXT, toActivityList } from '../xapi/publisher.js';
import { STANDARDS, httpOrigin } from '../standards.js';
import type { CompletionStatus, SuccessStatus } from '../persistence.js';
import { isRecord, type Verdict } from '../types.js';
import type { XAPIContext } from '../xapi/types.js';

const CMI5_MASTERYSCORE_EXT =
  'https://w3id.org/xapi/cmi5/context/extensions/masteryscore';

// cmi5 §9.6.2 — Defined Statements MUST carry the "cmi5" Category; completed/
// passed/failed MUST also carry "moveOn", or the LRS won't roll them up into
// cmi5 lifecycle state and the LMS never sees the AU as completed.
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

/** cmi5 §10 `LMS.LaunchData` document. `contextTemplate` is the base context for every statement to the LMS (§10.2.1). */
interface CMI5LaunchData {
  contextTemplate?: unknown;
  launchMode?: CMI5LaunchMode;
  launchMethod?: 'OwnWindow' | 'AnyWindow';
  returnURL?: string;
  masteryScore?: number;
  entitlementKey?: Record<string, string>;
  [k: string]: unknown;
}

function readContextTemplate(raw: unknown): XAPIContext | undefined {
  if (!isRecord(raw)) return undefined;
  const { contextActivities, extensions, ...rest } = raw;
  const activities = Object.entries(
    isRecord(contextActivities) ? contextActivities : {},
  ).map(([key, list]) => [key, toActivityList(list)]);
  return {
    // null is never a valid xAPI context value.
    ...Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== null)),
    contextActivities: Object.fromEntries(activities),
    extensions: isRecord(extensions) ? extensions : undefined,
  };
}

/**
 * CMI5 persistence adapter using xAPI.
 *
 * Lifecycle statements (Initialized, Completed, Passed/Failed, Terminated)
 * and per-interaction Answered statements all flow through a single
 * `XAPIPublisher` configured with `cmi5Mode: true`. Terminated goes out in
 * one batch after every statement still queued, which keeps it last
 * (cmi5 §9.3.6), and `cmi5Mode` injects the required `sessionid` context
 * extension on every statement (cmi5 §9.6.1.1).
 *
 * The version-neutral launch lifecycle lives in BaseXAPILaunchAdapter; this
 * class layers cmi5 specifics on top: fetch-token auth, LMS.LaunchData, the
 * cmi5 context (Category/moveOn/masteryScore), launch-mode gating, and the
 * Agent Profile GET.
 */
export class CMI5Adapter extends BaseXAPILaunchAdapter {
  /** cmi5 §10.2.2 — Browse/Review forbid every Defined Statement except Initialized/Terminated. */
  #launchMode: CMI5LaunchMode = 'Normal';
  #heldFailed = false;

  protected readonly logName = 'cmi5';
  protected readonly profile = STANDARDS.cmi5;
  protected readonly activityIdParam = 'activityId';
  protected readonly authParam = 'fetch';
  protected readonly credentialLabel = 'fetch token';

  // The cmi5 fetch URL is single-use (§6.2), so a failed token request fails
  // the launch instead of retrying.
  protected async resolveAuth(fetchUrl: string): Promise<string> {
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
    if (!token) {
      throw new Error(
        'Tessera cmi5: fetch token request returned an empty token. Expected a JSON body of the form {"auth-token": "..."}.',
      );
    }
    return token;
  }

  protected override async prepareLaunch(params: URLSearchParams) {
    this.masteryScore = parseMastery(
      params.get('masteryScore'),
      "cmi5 launch parameter 'masteryScore'",
    );
    // cmi5 §10: LaunchData carries the session id (§9.6.3.1), Publisher
    // Activity (§9.6.2.3), and launchMode/returnURL/masteryScore (§10.2); its
    // masteryScore overrides the URL value above (§10.2.4).
    // cmi5 §11: fetch the Agent Profile BEFORE Initialized. Strict LRSes track
    // the GET and reject Initialized otherwise. A 404 here is legitimate (no
    // prefs set); the GET itself is what's required.
    const [launchData] = await Promise.all([
      this.#fetchLaunchData(),
      this.#fetchLearnerPreferences(),
    ]);
    if (launchData) {
      if (
        typeof launchData.launchMode === 'string' &&
        VALID_LAUNCH_MODE.has(launchData.launchMode)
      ) {
        this.#launchMode = launchData.launchMode;
      }
      const { returnURL } = launchData;
      if (typeof returnURL === 'string' && httpOrigin(returnURL)) {
        this.returnURL = returnURL;
      } else if (returnURL) {
        console.warn(
          `Tessera: ignoring cmi5 LaunchData returnURL ${JSON.stringify(returnURL)}; it is not an absolute http(s) URL`,
        );
      }
      const launchMastery = parseMastery(
        launchData.masteryScore,
        'cmi5 LaunchData masteryScore',
      );
      if (launchMastery !== null) {
        this.masteryScore = launchMastery;
      }
    }
    const contextTemplate = readContextTemplate(launchData?.contextTemplate);
    const session = contextTemplate?.extensions?.[CMI5_SESSIONID_EXT];
    return {
      sessionId:
        typeof session === 'string' && session.trim() ? session : undefined,
      cmi5Mode: true,
      contextTemplate,
    };
  }

  override seedLifecycle(
    completion: CompletionStatus,
    success: SuccessStatus,
    score?: number | null,
  ): boolean {
    return super.seedLifecycle(
      completion,
      success === 'failed' ? 'unknown' : success,
      score,
    );
  }

  override setSuccessStatus(status: SuccessStatus, final = false): void {
    if (status === 'failed' && !final) {
      this.#heldFailed = true;
      super.setSuccessStatus('unknown');
      return;
    }
    this.#heldFailed = false;
    super.setSuccessStatus(status);
  }

  override terminate(unloading?: boolean): void {
    if (this.#heldFailed) super.setSuccessStatus('failed');
    super.terminate(unloading);
  }

  /** cmi5 §9.5.4.1 requires a duration on Completed, Passed and Failed, so an unread total falls back to the session's. */
  protected override get totalSeconds(): number {
    return super.totalSeconds ?? this.sessionSeconds;
  }

  /** cmi5 §9.5.4.1: Terminated spans Initialized to Terminated, and the LMS sums the sessions. */
  protected override get terminatedSeconds(): number {
    return this.sessionSeconds;
  }

  /** cmi5 §10.2.2 — Browse/Review forbid Completed/Passed/Failed. */
  protected override isDefinedStatementAllowed(): boolean {
    return this.#launchMode === 'Normal';
  }

  /**
   * cmi5 §9.3.4 / §9.3.5 — Passed-with-score requires scaled >=
   * masteryScore; Failed-with-score requires scaled < masteryScore. The
   * author asserted the verb, so on contradiction keep the verb and drop
   * the score (and warn).
   */
  protected override scoreForSuccess(status: Verdict): number | null {
    const { scaled } = this;
    if (scaled === null) return null;
    if (this.masteryScore !== null) {
      const violatesPassed = status === 'passed' && scaled < this.masteryScore;
      const violatesFailed = status === 'failed' && scaled >= this.masteryScore;
      if (violatesPassed || violatesFailed) {
        console.warn(
          `Tessera cmi5: refusing to attach scaled score ${scaled} to ` +
            `${status === 'passed' ? 'Passed' : 'Failed'} (masteryScore=${this.masteryScore}); ` +
            `per cmi5 §9.3.${status === 'passed' ? '4' : '5'} the score would contradict the verb. ` +
            `Statement will be sent without a score.`,
        );
        return null;
      }
    }
    return scaled;
  }

  /**
   * The cmi5 additions to a Defined Statement's context, which the publisher
   * lays over the LMS contextTemplate: the cmi5 Category (§9.6.2.1), moveOn
   * for Completed/Passed/Failed (§9.6.2.2), and masteryScore for Passed/Failed
   * (§9.6.3.2).
   */
  protected override buildContext(
    opts: { moveOn?: boolean; mastery?: boolean } = {},
  ): XAPIContext {
    const category = [{ id: CMI5_CATEGORY_CMI5, objectType: 'Activity' }];
    if (opts.moveOn) {
      category.push({ id: CMI5_CATEGORY_MOVEON, objectType: 'Activity' });
    }
    return {
      contextActivities: { category },
      ...(opts.mastery &&
        this.masteryScore !== null && {
          extensions: { [CMI5_MASTERYSCORE_EXT]: this.masteryScore },
        }),
    };
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
