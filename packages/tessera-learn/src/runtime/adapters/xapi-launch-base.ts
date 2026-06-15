import type { PersistenceAdapter, SavedState } from '../persistence.js';
import type { Interaction } from '../interaction.js';
import {
  formatResponse,
  formatCorrectPattern,
  XAPI_INTERACTION_FORMAT,
} from '../interaction-format.js';
import { formatISO8601Duration } from './format.js';
import { XAPIPublisher } from '../xapi/publisher.js';
import type { XAPIAgent } from '../xapi/types.js';

export const VERBS = {
  initialized: 'http://adlnet.gov/expapi/verbs/initialized',
  answered: 'http://adlnet.gov/expapi/verbs/answered',
  completed: 'http://adlnet.gov/expapi/verbs/completed',
  passed: 'http://adlnet.gov/expapi/verbs/passed',
  failed: 'http://adlnet.gov/expapi/verbs/failed',
  terminated: 'http://adlnet.gov/expapi/verbs/terminated',
} as const;

const CMI_INTERACTION_TYPE =
  'http://adlnet.gov/expapi/activities/cmi.interaction';

/** `.then` handler that warns on LRS non-2xx. The publisher resolves successfully on 4xx/5xx (failure is in the destination outcome), so `.catch` alone misses them. */
export function warnOnLRSReject(
  label: string,
): (res: {
  destinations?: Array<{ ok?: boolean; status?: number; error?: Error }>;
}) => void {
  return (res) => {
    const dest = res.destinations?.[0];
    if (dest && !dest.ok) {
      console.warn(
        `Tessera xAPI: ${label} statement rejected by LRS (${dest.status ?? 'network error'})`,
        dest.error,
      );
    }
  };
}

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

  protected score: number | null = null;
  protected durationSeconds = 0;
  protected state: SavedState | null = null;
  protected completedEmitted = false;
  protected lastSuccessEmitted: 'unknown' | 'passed' | 'failed' = 'unknown';
  protected terminated = false;
  protected returnURL: string | undefined;

  abstract init(): Promise<void>;

  /** Profile context for a Defined Statement. Plain xAPI adds only registration. */
  protected buildContext(
    _opts: { moveOn?: boolean; mastery?: boolean } = {},
  ): Record<string, unknown> | undefined {
    return this.registration ? { registration: this.registration } : undefined;
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
            `Tessera xAPI: State API PUT returned ${resp.status}; learner progress did not persist.`,
          );
        }
      } catch (err) {
        console.warn('Tessera xAPI: Failed to save state', err);
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
    this.publisher
      .sendStatement({
        verb: { id: VERBS.completed, display: { 'en-US': 'completed' } },
        result,
        context: this.buildContext({ moveOn: true }),
      })
      .then(warnOnLRSReject('Completed'))
      .catch((err) => {
        console.warn('Tessera xAPI: failed to send Completed statement', err);
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
    this.publisher
      .sendStatement({
        verb: { id: verb, display: { 'en-US': verbName } },
        result,
        context: this.buildContext({ moveOn: true, mastery: true }),
      })
      .then(warnOnLRSReject(status === 'passed' ? 'Passed' : 'Failed'))
      .catch((err) => {
        console.warn(`Tessera xAPI: failed to send ${verbName} statement`, err);
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
    this.publisher
      .sendStatement({
        verb: { id: VERBS.answered, display: { 'en-US': 'answered' } },
        object: {
          id: `${this.activityId}#${questionId}`,
          objectType: 'Activity',
          definition,
        },
        result,
      })
      .then(warnOnLRSReject('Answered'))
      .catch((err) => {
        console.warn('Tessera xAPI: failed to send Answered statement', err);
      });
  }

  terminate(): void {
    if (this.terminated) return;
    this.terminated = true;
    if (!this.publisher) return;
    this.publisher.markUnloading();
    const duration = formatISO8601Duration(this.durationSeconds);
    this.publisher
      .sendStatement({
        verb: { id: VERBS.terminated, display: { 'en-US': 'terminated' } },
        result: { duration },
        context: this.buildContext(),
      })
      .then(warnOnLRSReject('Terminated'))
      .catch((err) => {
        console.warn('Tessera xAPI: failed to send Terminated statement', err);
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
          `Tessera xAPI: State API GET returned ${resp.status}; resume disabled for this launch.`,
        );
      }
    } catch (err) {
      console.warn(
        `Tessera xAPI: State API GET failed (${err instanceof Error ? err.message : String(err)}); resume disabled for this launch.`,
      );
      this.state = null;
    }
  }
}
