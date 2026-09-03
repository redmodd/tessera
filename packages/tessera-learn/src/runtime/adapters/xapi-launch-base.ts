import type { PersistenceAdapter, SavedState } from '../persistence.js';
import type { Interaction } from '../interaction.js';
import {
  formatResponse,
  formatCorrectPattern,
  XAPI_INTERACTION_FORMAT,
} from '../interaction-format.js';
import { formatISO8601Duration } from './format.js';
import { XAPIPublisher } from '../xapi/publisher.js';
import { validateAgent, joinFieldError } from '../xapi/agent-rules.js';
import type { XAPIAgent, PartialStatement } from '../xapi/types.js';

export const VERBS = {
  initialized: 'http://adlnet.gov/expapi/verbs/initialized',
  answered: 'http://adlnet.gov/expapi/verbs/answered',
  completed: 'http://adlnet.gov/expapi/verbs/completed',
  passed: 'http://adlnet.gov/expapi/verbs/passed',
  failed: 'http://adlnet.gov/expapi/verbs/failed',
  terminated: 'http://adlnet.gov/expapi/verbs/terminated',
} as const;

/** Some LMSes send `actor` in xAPI Person shape (seen from SCORM Cloud). */
function normalizeLaunchActor(parsed: Record<string, unknown>): XAPIAgent {
  const out: Record<string, unknown> = {};
  for (const k of [
    'objectType',
    'name',
    'mbox',
    'mbox_sha1sum',
    'openid',
    'account',
  ]) {
    const v = Array.isArray(parsed[k]) ? parsed[k][0] : parsed[k];
    if (v !== undefined) out[k] = v;
  }
  if (Array.isArray(parsed.member) && parsed.member.length > 0) {
    out.member = parsed.member;
  }
  if (out.account !== undefined) {
    const acc = out.account as Record<string, unknown> | null;
    out.account = {
      homePage: acc?.homePage ?? acc?.accountServiceHomePage,
      name: acc?.name ?? acc?.accountName,
    };
  }
  if (typeof out.name !== 'string') delete out.name;
  if (out.objectType !== undefined && out.member === undefined) {
    out.objectType = 'Agent';
  }
  let kept = false;
  for (const k of ['account', 'mbox', 'mbox_sha1sum', 'openid']) {
    if (out[k] === undefined) continue;
    if (!kept && validateAgent({ [k]: out[k] }) === null) kept = true;
    else delete out[k];
  }
  return out as XAPIAgent;
}

const CMI_INTERACTION_TYPE =
  'http://adlnet.gov/expapi/activities/cmi.interaction';

/**
 * Version-neutral xAPI launch lifecycle shared by the cmi5 and plain-xAPI
 * adapters. Subclasses set the protected fields in init() and may override
 * buildContext()/isDefinedStatementAllowed()/scoreForSuccess() to layer
 * profile rules on top.
 */
export abstract class BaseXAPILaunchAdapter implements PersistenceAdapter {
  protected publisher: XAPIPublisher | null = null;
  protected endpoint = '';
  protected activityId = '';
  protected actor: XAPIAgent | null = null;
  protected registration: string | undefined;
  protected authToken = '';
  protected version = '1.0.3';
  /** Prefix for this adapter's console warnings (e.g. "cmi5", "xAPI"). */
  protected logName = 'xAPI';

  protected score: number | null = null;
  protected durationSeconds = 0;
  protected state: SavedState | null = null;
  protected completedEmitted = false;
  protected lastSuccessEmitted: 'unknown' | 'passed' | 'failed' = 'unknown';
  protected terminated = false;
  protected returnURL: string | undefined;

  abstract init(): Promise<void>;

  /** Profile context for a Defined Statement. Plain xAPI adds nothing — the publisher injects context.registration on its own. */
  protected buildContext(
    _opts: { moveOn?: boolean; mastery?: boolean } = {},
  ): Record<string, unknown> | undefined {
    return undefined;
  }

  /** cmi5 Browse/Review gating hook. Plain xAPI always allows. */
  protected isDefinedStatementAllowed(): boolean {
    return true;
  }

  /** Scaled score to attach to Passed/Failed, or null to omit. cmi5 overrides for masteryScore gating. */
  protected scoreForSuccess(_status: 'passed' | 'failed'): number | null {
    return this.score !== null ? this.score / 100 : null;
  }

  getPublisher(): XAPIPublisher | null {
    return this.publisher;
  }

  getState(): SavedState | null {
    return this.state;
  }

  saveState(state: SavedState): void {
    this.state = state;
    if (!this.publisher) return;
    void this.publisher.chainTask(async () => {
      try {
        const resp = await this.xapiFetch(this.buildStateUrl(), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(state),
        });
        if (!resp.ok) {
          console.warn(
            `Tessera ${this.logName}: State API PUT returned ${resp.status}; learner progress did not persist.`,
          );
        }
      } catch (err) {
        console.warn(`Tessera ${this.logName}: Failed to save state`, err);
      }
    });
  }

  setScore(score: number): void {
    if (!Number.isFinite(score)) {
      this.score = null;
      return;
    }
    this.score = Math.max(0, Math.min(100, score));
  }

  setDuration(seconds: number): void {
    this.durationSeconds = seconds;
  }

  setExit(_mode: 'suspend' | 'normal'): void {
    // No cmi.exit analogue in xAPI; suspend is implicit. No-op.
  }

  commit(): void {
    // Statements are sent individually. No-op.
  }

  seedLifecycle(
    completion: 'incomplete' | 'complete',
    success: 'unknown' | 'passed' | 'failed',
  ): void {
    if (completion === 'complete') this.completedEmitted = true;
    if (success === 'passed' || success === 'failed') {
      this.lastSuccessEmitted = success;
    }
  }

  setCompletionStatus(status: 'incomplete' | 'complete'): void {
    if (status !== 'complete' || this.completedEmitted || !this.publisher)
      return;
    if (!this.isDefinedStatementAllowed()) return;
    this.completedEmitted = true;
    const result: Record<string, unknown> = {
      completion: true,
      duration: formatISO8601Duration(this.durationSeconds),
    };
    this.dispatch('Completed', {
      verb: { id: VERBS.completed, display: { 'en-US': 'completed' } },
      result,
      context: this.buildContext({ moveOn: true }),
    });
  }

  setSuccessStatus(status: 'passed' | 'failed' | 'unknown'): void {
    if (status === 'unknown' || !this.publisher) return;
    if (status === this.lastSuccessEmitted) return;
    if (!this.isDefinedStatementAllowed()) return;
    this.lastSuccessEmitted = status;

    const verb = status === 'passed' ? VERBS.passed : VERBS.failed;
    const verbName = status === 'passed' ? 'passed' : 'failed';
    const result: Record<string, unknown> = {
      success: status === 'passed',
      duration: formatISO8601Duration(this.durationSeconds),
    };
    const scaled = this.scoreForSuccess(status);
    if (scaled !== null) result.score = { scaled };
    this.dispatch(status === 'passed' ? 'Passed' : 'Failed', {
      verb: { id: verb, display: { 'en-US': verbName } },
      result,
      context: this.buildContext({ moveOn: true, mastery: true }),
    });
  }

  reportInteraction(
    questionId: string,
    interaction: Interaction,
    correct: boolean | null,
  ): void {
    if (!this.publisher) return;
    const response = formatResponse(interaction, XAPI_INTERACTION_FORMAT);
    const pattern = formatCorrectPattern(interaction, XAPI_INTERACTION_FORMAT);
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
    this.dispatch('Answered', {
      verb: { id: VERBS.answered, display: { 'en-US': 'answered' } },
      object: {
        id: `${this.activityId}#${questionId}`,
        objectType: 'Activity',
        definition,
      },
      result,
    });
  }

  terminate(): void {
    if (this.terminated) return;
    this.terminated = true;
    if (!this.publisher) return;
    this.publisher.markUnloading();
    const duration = formatISO8601Duration(this.durationSeconds);
    this.dispatch('Terminated', {
      verb: { id: VERBS.terminated, display: { 'en-US': 'terminated' } },
      result: { duration },
      context: this.buildContext(),
    });
  }

  async exit(): Promise<void> {
    this.terminate();
    if (this.publisher) {
      try {
        await this.publisher.chainTask(async () => {});
      } catch {
        // never rejects today; don't block redirect.
      }
    }
    if (this.returnURL && typeof window !== 'undefined') {
      window.location.assign(this.returnURL);
    }
  }

  /** Parse the launch `actor` param into an Identified Agent, failing loud on malformed JSON. */
  protected parseActorParam(raw: string): void {
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') {
        throw new Error('actor must be an object');
      }
      const actor = normalizeLaunchActor(parsed as Record<string, unknown>);
      const invalid = validateAgent(actor);
      if (invalid) throw new Error(joinFieldError('actor', invalid));
      this.actor = actor;
    } catch (err) {
      throw new Error(
        `Tessera ${this.logName}: launch parameter 'actor' is malformed (${err instanceof Error ? err.message : String(err)}). The LMS did not send a valid Identified Agent JSON.`,
        { cause: err },
      );
    }
  }

  /** Construct the publisher from the resolved launch fields plus per-profile options. */
  protected async createPublisher(opts: {
    sessionId?: string;
    cmi5Mode?: boolean;
  }): Promise<XAPIPublisher> {
    if (!this.actor) {
      throw new Error(
        `Tessera ${this.logName}: cannot create publisher before the launch actor is resolved.`,
      );
    }
    this.publisher = new XAPIPublisher({
      endpoint: this.endpoint,
      auth: this.authToken,
      actor: this.actor,
      activityId: this.activityId,
      registration: this.registration,
      version: this.version,
      ...opts,
    });
    try {
      await this.publisher.init();
    } catch (err) {
      this.publisher = null;
      throw err;
    }
    return this.publisher;
  }

  /** Fire-and-forget Initialized statement (the first Defined Statement of the session). */
  protected sendInitialized(): void {
    this.dispatch('Initialized', {
      verb: { id: VERBS.initialized, display: { 'en-US': 'initialized' } },
      context: this.buildContext(),
    });
  }

  /** Enqueue a lifecycle statement fire-and-forget. `label` names it in both the LRS-reject and send-failure warnings. */
  protected dispatch(label: string, partial: PartialStatement): void {
    if (!this.publisher) return;
    this.publisher
      .sendStatement(partial)
      .then(this.warnOnLRSReject(label))
      .catch((err) => {
        console.warn(
          `Tessera ${this.logName}: failed to send ${label} statement`,
          err,
        );
      });
  }

  /** `.then` handler that warns on LRS non-2xx. The publisher resolves successfully on 4xx/5xx (failure is in the destination outcome), so `.catch` alone misses them. */
  protected warnOnLRSReject(
    label: string,
  ): (res: {
    destinations?: Array<{ ok?: boolean; status?: number; error?: Error }>;
  }) => void {
    const logName = this.logName;
    return (res) => {
      const dest = res.destinations?.[0];
      if (dest && !dest.ok) {
        console.warn(
          `Tessera ${logName}: ${label} statement rejected by LRS (${dest.status ?? 'network error'})`,
          dest.error,
        );
      }
    };
  }

  protected buildStateUrl(stateId: string = 'tessera-state'): string {
    const params = new URLSearchParams({
      activityId: this.activityId,
      agent: JSON.stringify(this.actor),
      stateId,
    });
    if (this.registration) params.set('registration', this.registration);
    return `${this.endpoint}activities/state?${params.toString()}`;
  }

  protected async xapiFetch(
    url: string,
    options: RequestInit = {},
  ): Promise<Response> {
    const headers = new Headers(options.headers);
    if (this.authToken) {
      headers.set('Authorization', `Basic ${this.authToken}`);
    }
    headers.set('X-Experience-API-Version', this.version);
    const keepalive = this.publisher?.isUnloading() ?? false;
    return fetch(url, {
      ...options,
      headers,
      ...(keepalive ? { keepalive: true } : {}),
    });
  }

  /** Shared resume GET — call from a subclass init() after the publisher exists. */
  protected async loadResumeState(): Promise<void> {
    try {
      const resp = await this.xapiFetch(this.buildStateUrl(), {
        method: 'GET',
      });
      if (resp.ok) {
        this.state = await resp.json();
      } else if (resp.status !== 404) {
        console.warn(
          `Tessera ${this.logName}: State API GET returned ${resp.status}; resume disabled for this launch.`,
        );
      }
    } catch (err) {
      console.warn(
        `Tessera ${this.logName}: State API GET failed (${err instanceof Error ? err.message : String(err)}); resume disabled for this launch.`,
      );
      this.state = null;
    }
  }
}
