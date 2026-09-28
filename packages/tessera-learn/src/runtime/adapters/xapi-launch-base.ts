import type {
  CompletionStatus,
  SavedState,
  SuccessStatus,
} from '../persistence.js';
import type { Interaction } from '../interaction.js';
import { formatResponse, formatCorrectPattern } from '../interaction-format.js';
import { STANDARDS, httpOrigin, type LaunchLRSStandard } from '../standards.js';
import { formatISO8601Duration, toScaled } from './format.js';
import { RETRY_ATTEMPTS, backoffMs } from './retry.js';
import { BaseAdapter } from './base.js';
import { XAPIPublisher, type XAPIPublisherOptions } from '../xapi/publisher.js';
import { X_API_VERSION } from '../xapi/version.js';
import { validateAgent, joinFieldError } from '../xapi/agent-rules.js';
import type {
  XAPIAgent,
  PartialStatement,
  DestinationOutcome,
} from '../xapi/types.js';

export const VERBS = {
  initialized: 'http://adlnet.gov/expapi/verbs/initialized',
  answered: 'http://adlnet.gov/expapi/verbs/answered',
  completed: 'http://adlnet.gov/expapi/verbs/completed',
  passed: 'http://adlnet.gov/expapi/verbs/passed',
  failed: 'http://adlnet.gov/expapi/verbs/failed',
  scored: 'http://adlnet.gov/expapi/verbs/scored',
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
 * Overall budget for the resume GET, retries and backoff included. One deadline
 * covers every attempt so a stalled State API can't hold the launch for
 * attempts x per-request timeout.
 */
const STATE_LOAD_TIMEOUT_MS = 10_000;

const EXIT_STATE_ID = 'tessera-state-exit';

type PublisherLaunchOptions = Pick<
  XAPIPublisherOptions,
  'sessionId' | 'cmi5Mode'
>;

/**
 * Version-neutral xAPI launch lifecycle shared by the cmi5 and plain-xAPI
 * adapters. `init()` runs the launch in a fixed order; subclasses fill in its
 * steps and may override buildContext()/isDefinedStatementAllowed()/
 * scoreForSuccess() to layer profile rules on top.
 */
export abstract class BaseXAPILaunchAdapter extends BaseAdapter {
  protected publisher: XAPIPublisher | null = null;
  protected endpoint = '';
  protected actor: XAPIAgent | null = null;
  protected abstract readonly activityIdParam: string;
  /** Prefix for this adapter's console warnings (e.g. "cmi5", "xAPI"). */
  protected abstract readonly logName: string;
  protected abstract readonly profile: (typeof STANDARDS)[LaunchLRSStandard];

  protected scaled: number | null = null;
  protected durationSeconds = 0;
  protected stateLoadFailed = false;
  protected completedEmitted = false;
  protected lastSuccessEmitted: SuccessStatus = 'unknown';
  protected lastScoreEmitted: number | null = null;
  protected terminated = false;
  protected returnURL: string | undefined;
  #activityId = '';
  #registration: string | undefined;
  #authToken = '';
  #finalSend: Promise<void> | null = null;
  #stateSeq = 0;
  #stateSaved = true;

  /** The adapter for this launch, or null when the LMS did not send every one of `launchParams`. */
  static connect<T extends BaseXAPILaunchAdapter>(
    this: (new () => T) & { readonly launchParams: readonly string[] },
  ): T | null {
    const params = new URLSearchParams(window.location.search);
    return this.launchParams.every((p) => params.get(p)) ? new this() : null;
  }

  /**
   * The endpoint and actor are checked before auth so a bad
   * launch fails before a single-use cmi5 fetch token is spent, and auth
   * resolves before `prepareLaunch()` because its requests carry the token
   * and the actor.
   */
  async init(): Promise<void> {
    const params = new URLSearchParams(window.location.search);
    this.endpoint = (params.get('endpoint') || '').replace(/\/?$/, '/');
    if (!httpOrigin(this.endpoint)) {
      throw new Error(
        `Tessera ${this.logName}: launch parameter 'endpoint' is not an absolute http(s) URL. The LMS did not send a usable LRS endpoint.`,
      );
    }
    this.#activityId = params.get(this.activityIdParam) || '';
    // xAPI requires `context.registration` to be a UUID; sending an empty
    // string makes LRSes 400. Omit when the LMS didn't provide one.
    this.#registration = params.get('registration') || undefined;
    const actor = this.#parseActorParam(params.get('actor') || '');
    this.actor = actor;
    this.#authToken = await this.resolveAuth(params);
    const publisher = new XAPIPublisher({
      endpoint: this.endpoint,
      auth: this.#authToken,
      actor,
      activityId: this.#activityId,
      registration: this.#registration,
      ...(await this.prepareLaunch(params)),
    });
    await publisher.init();
    this.publisher = publisher;
    this.#sendInitialized();
  }

  /** The Basic credential (without the scheme) for every LRS request. */
  protected abstract resolveAuth(params: URLSearchParams): Promise<string>;

  /** Profile launch requests that must precede Initialized; returns the profile's publisher options. */
  protected async prepareLaunch(
    _params: URLSearchParams,
  ): Promise<PublisherLaunchOptions> {
    return {};
  }

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
    return this.scaled;
  }

  override launchPublisher(): XAPIPublisher | null {
    return this.publisher;
  }

  override deriveActor(): XAPIAgent | null {
    return this.actor;
  }

  saveState(state: SavedState): void {
    // The resume GET failed, so writing would replace state we never read with
    // a blank-slate session. Grades travel as statements, so this costs the
    // bookmark only.
    if (this.stateLoadFailed) return;
    this.state = state;
    if (!this.publisher) return;
    void this.publisher.chainTask(async () => {
      this.#stateSaved = await this.#putState(state);
    });
  }

  async #putState(state: SavedState, stateId?: string): Promise<boolean> {
    try {
      const resp = await this.xapiFetch(this.buildStateUrl(stateId), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...state, n: ++this.#stateSeq }),
      });
      if (!resp.ok) {
        console.warn(
          `Tessera ${this.logName}: State API PUT returned ${resp.status}; learner progress did not persist.`,
        );
      }
      return resp.ok;
    } catch (err) {
      console.warn(`Tessera ${this.logName}: Failed to save state`, err);
      return false;
    }
  }

  override setScore(score: number): void {
    this.scaled = Number.isFinite(score) ? toScaled(score) : null;
  }

  override setDuration(seconds: number): void {
    this.durationSeconds = seconds;
  }

  override commit(): void {
    const { scaled } = this;
    if (!this.publisher || scaled === null) return;
    if (scaled === this.lastScoreEmitted) return;
    this.lastScoreEmitted = scaled;
    this.dispatch('Scored', {
      verb: { id: VERBS.scored, display: { 'en-US': 'scored' } },
      result: {
        score: { scaled },
        duration: formatISO8601Duration(this.durationSeconds),
      },
    });
  }

  override seedLifecycle(
    completion: CompletionStatus,
    success: SuccessStatus,
    score?: number | null,
  ): boolean {
    if (completion === 'complete') this.completedEmitted = true;
    if (success === 'passed' || success === 'failed') {
      this.lastSuccessEmitted = success;
    }
    if (typeof score === 'number' && Number.isFinite(score)) {
      this.setScore(score);
      this.lastScoreEmitted = this.scaled;
    }
    return true;
  }

  override setCompletionStatus(status: CompletionStatus): void {
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

  override setSuccessStatus(status: SuccessStatus): void {
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
    if (scaled !== null) {
      result.score = { scaled };
      this.lastScoreEmitted = scaled;
    }
    this.dispatch(status === 'passed' ? 'Passed' : 'Failed', {
      verb: { id: verb, display: { 'en-US': verbName } },
      result,
      context: this.buildContext({ moveOn: true, mastery: true }),
    });
  }

  override reportInteraction(
    questionId: string,
    interaction: Interaction,
    correct: boolean | null,
  ): void {
    if (!this.publisher) return;
    const { interactionFormat } = this.profile;
    const response = formatResponse(interaction, interactionFormat);
    const patterns = formatCorrectPattern(interaction, interactionFormat);
    const definition: Record<string, unknown> = {
      type: CMI_INTERACTION_TYPE,
      interactionType: interaction.type,
    };
    if (patterns !== null) {
      definition.correctResponsesPattern = patterns;
    }
    const result: Record<string, unknown> = { response };
    if (correct !== null) {
      result.success = correct;
    }
    this.dispatch('Answered', {
      verb: { id: VERBS.answered, display: { 'en-US': 'answered' } },
      object: {
        id: `${this.#activityId}#${questionId}`,
        objectType: 'Activity',
        definition,
      },
      result,
    });
  }

  override terminate(unloading = true): void {
    if (this.terminated) return;
    this.terminated = true;
    if (!this.publisher) return;
    if (unloading) {
      this.publisher.markUnloading();
      if (this.state) void this.#putState(this.state, EXIT_STATE_ID);
    }
    const duration = formatISO8601Duration(this.durationSeconds);
    this.#finalSend = this.#report(
      'Terminated',
      this.publisher.sendFinal({
        verb: { id: VERBS.terminated, display: { 'en-US': 'terminated' } },
        result: { duration },
        context: this.buildContext(),
      }),
    );
  }

  override async exit(deadline: Promise<unknown>): Promise<void> {
    const settles = (task: Promise<unknown>) =>
      Promise.race([task.then(() => true), deadline.then(() => false)]);
    if (!this.terminated) {
      const saved =
        !this.publisher ||
        ((await settles(this.publisher.drained())) && this.#stateSaved);
      this.terminate(!saved);
    }
    if (this.#finalSend) await settles(this.#finalSend);
  }

  override returnToLMS(): boolean {
    if (!this.returnURL || typeof window === 'undefined') return false;
    window.location.assign(this.returnURL);
    return true;
  }

  /** Parse the launch `actor` param into an Identified Agent, failing loud on malformed JSON. */
  #parseActorParam(raw: string): XAPIAgent {
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') {
        throw new Error('actor must be an object');
      }
      const actor = normalizeLaunchActor(parsed as Record<string, unknown>);
      const invalid = validateAgent(actor);
      if (invalid) throw new Error(joinFieldError('actor', invalid));
      return actor;
    } catch (err) {
      throw new Error(
        `Tessera ${this.logName}: launch parameter 'actor' is malformed (${err instanceof Error ? err.message : String(err)}). The LMS did not send a valid Identified Agent JSON.`,
        { cause: err },
      );
    }
  }

  /**
   * Fire-and-forget Initialized statement (the first Defined Statement of the
   * session). Queued before the caller's loadState(), so a slow LRS can't push
   * it past cmi5 §9.3.2's "reasonable period".
   */
  #sendInitialized(): void {
    this.dispatch('Initialized', {
      verb: { id: VERBS.initialized, display: { 'en-US': 'initialized' } },
      context: this.buildContext(),
    });
  }

  /** Enqueue a lifecycle statement fire-and-forget. `label` names it in both the LRS-reject and send-failure warnings. */
  protected dispatch(label: string, partial: PartialStatement): void {
    if (!this.publisher || this.terminated) return;
    void this.#report(
      label,
      this.publisher.sendStatement(partial).then((r) => r.destinations[0]),
    );
  }

  /** Warns on LRS non-2xx as well as send failures. The publisher resolves successfully on 4xx/5xx (failure is in the destination outcome), so `.catch` alone misses them. */
  #report(label: string, send: Promise<DestinationOutcome>): Promise<void> {
    return send.then(
      (dest) => {
        if (!dest.ok) {
          console.warn(
            `Tessera ${this.logName}: ${label} statement rejected by LRS (${dest.status ?? 'network error'})`,
            dest.error,
          );
        }
      },
      (err) => {
        console.warn(
          `Tessera ${this.logName}: failed to send ${label} statement`,
          err,
        );
      },
    );
  }

  protected buildStateUrl(stateId: string = 'tessera-state'): string {
    const params = new URLSearchParams({
      activityId: this.#activityId,
      agent: JSON.stringify(this.actor),
      stateId,
    });
    if (this.#registration) params.set('registration', this.#registration);
    return `${this.endpoint}activities/state?${params.toString()}`;
  }

  protected async xapiFetch(
    url: string,
    options: RequestInit = {},
  ): Promise<Response> {
    const headers = new Headers(options.headers);
    if (this.#authToken) {
      headers.set('Authorization', `Basic ${this.#authToken}`);
    }
    headers.set('X-Experience-API-Version', X_API_VERSION);
    const keepalive = this.publisher?.isUnloading() ?? false;
    return fetch(url, {
      ...options,
      headers,
      ...(keepalive ? { keepalive: true } : {}),
    });
  }

  /**
   * Resume GET of the running and exit state documents, retried on the shared
   * LMS backoff schedule; the one with the higher write sequence wins. A 404,
   * an empty body, or an unparseable one is a definitive answer and returns
   * with saving enabled. Exhausting the attempts or the deadline leaves the
   * stored state unread, so `stateLoadFailed` withholds every later write.
   */
  override async loadState(): Promise<void> {
    const deadline = AbortSignal.timeout(STATE_LOAD_TIMEOUT_MS);
    let lastDetail = '';
    for (let attempt = 0; attempt < RETRY_ATTEMPTS; attempt++) {
      if (attempt > 0) {
        await new Promise((r) => setTimeout(r, backoffMs(attempt - 1)));
        if (deadline.aborted) break;
      }
      try {
        const [running, exit] = await Promise.all([
          this.#getStateDoc(this.buildStateUrl(), deadline),
          this.#getStateDoc(this.buildStateUrl(EXIT_STATE_ID), deadline),
        ]);
        const latest = (exit?.n ?? 0) > (running?.n ?? 0) ? exit : running;
        this.#stateSeq = latest?.n ?? 0;
        if (latest) {
          const { n: _n, ...state } = latest;
          this.state = state;
        } else {
          this.state = null;
        }
        return;
      } catch (err) {
        lastDetail = err instanceof Error ? err.message : String(err);
        if (deadline.aborted) break;
      }
    }
    this.stateLoadFailed = true;
    this.state = null;
    console.warn(
      `Tessera ${this.logName}: State API GET failed after ${RETRY_ATTEMPTS} attempts (${lastDetail}); resume disabled, and progress will not be saved this launch so the unread state is left intact.`,
    );
  }

  async #getStateDoc(
    url: string,
    signal: AbortSignal,
  ): Promise<(SavedState & { n?: number }) | null> {
    const resp = await this.xapiFetch(url, { method: 'GET', signal });
    if (resp.status === 404) return null;
    if (!resp.ok) throw new Error(`returned ${resp.status}`);
    const body = (await resp.text()).trim();
    if (!body) return null;
    try {
      return JSON.parse(body);
    } catch {
      console.warn(
        `Tessera ${this.logName}: State API returned an unparseable document; starting fresh and overwriting it.`,
      );
      return null;
    }
  }
}
