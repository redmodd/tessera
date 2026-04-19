import type { PersistenceAdapter, SavedState } from '../persistence.js';
import type { Interaction } from '../interaction.js';
import { formatResponse, formatCorrectPattern } from '../interaction-format.js';
import { formatISO8601Duration } from './retry.js';

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
} as const;

const CMI_INTERACTION_TYPE = 'http://adlnet.gov/expapi/activities/cmi.interaction';

/**
 * Check if CMI5 launch parameters are present in the URL.
 */
export function hasCMI5LaunchParams(): boolean {
  const params = new URLSearchParams(window.location.search);
  return !!(
    params.get('fetch') &&
    params.get('endpoint') &&
    params.get('activityId') &&
    params.get('actor')
  );
}

/**
 * CMI5 persistence adapter using xAPI.
 */
export class CMI5Adapter implements PersistenceAdapter {
  #endpoint = '';
  #registration = '';
  #activityId = '';
  #actor: any = null;
  #authToken = '';
  #terminated = false;

  // Stored internally for inclusion in statements
  #score: number | null = null;
  #durationSeconds = 0;
  #state: SavedState | null = null;
  #completedSent = false;
  #successSent = false;

  async init(): Promise<void> {
    const params = new URLSearchParams(window.location.search);
    const fetchUrl = params.get('fetch');
    // Normalize endpoint to always have a trailing slash so URL concatenation is safe
    this.#endpoint = (params.get('endpoint') || '').replace(/\/?$/, '/');
    this.#registration = params.get('registration') || '';
    this.#activityId = params.get('activityId') || '';

    try {
      this.#actor = JSON.parse(params.get('actor') || '{}');
    } catch {
      this.#actor = {};
    }

    // Get auth token
    if (fetchUrl) {
      try {
        const resp = await fetch(fetchUrl, { method: 'POST' });
        if (resp.ok) {
          const text = await resp.text();
          // The fetch URL returns the token, possibly with "auth-token" prefix
          this.#authToken = text.replace(/^auth-token=/, '').trim();
        }
      } catch (err) {
        console.warn('Tessera: Failed to fetch CMI5 auth token', err);
      }
    }

    // Retrieve saved state from xAPI State API
    try {
      const stateUrl = this.#buildStateUrl();
      const resp = await this.#xapiFetch(stateUrl, { method: 'GET' });
      if (resp.ok) {
        this.#state = await resp.json();
      }
    } catch {
      this.#state = null;
    }

    // Send Initialized statement
    await this.#sendStatement(VERBS.initialized);
  }

  getState(): SavedState | null {
    return this.#state;
  }

  saveState(state: SavedState): void {
    this.#state = state;
    const stateUrl = this.#buildStateUrl();
    // Fire-and-forget PUT to State API
    this.#xapiFetch(stateUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(state),
    }).catch((err) => {
      console.warn('Tessera: Failed to save CMI5 state', err);
    });
  }

  setScore(score: number): void {
    this.#score = score;
  }

  setCompletionStatus(status: 'incomplete' | 'complete'): void {
    if (status === 'complete' && !this.#completedSent) {
      this.#completedSent = true;
      const result: any = {
        completion: true,
        duration: formatISO8601Duration(this.#durationSeconds),
      };
      if (this.#score !== null) {
        result.score = { scaled: this.#score / 100 };
      }
      this.#sendStatement(VERBS.completed, result);
    }
  }

  setSuccessStatus(status: 'passed' | 'failed' | 'unknown'): void {
    if (status === 'unknown') return;
    if (this.#successSent) return;
    this.#successSent = true;

    const verb = status === 'passed' ? VERBS.passed : VERBS.failed;
    const result: any = {
      success: status === 'passed',
      duration: formatISO8601Duration(this.#durationSeconds),
    };
    if (this.#score !== null) {
      result.score = { scaled: this.#score / 100 };
    }
    this.#sendStatement(verb, result);
  }

  setDuration(seconds: number): void {
    this.#durationSeconds = seconds;
  }

  reportInteraction(
    questionId: string,
    interaction: Interaction,
    correct: boolean | null
  ): void {
    const response = formatResponse(interaction);
    const pattern = formatCorrectPattern(interaction);
    const definition: any = {
      type: CMI_INTERACTION_TYPE,
      interactionType: interaction.type,
    };
    if (pattern !== null) {
      definition.correctResponsesPattern = [pattern];
    }
    const result: any = { response };
    if (correct !== null) {
      result.success = correct;
    }
    const statement: any = {
      actor: this.#actor,
      verb: { id: VERBS.answered, display: { 'en-US': 'answered' } },
      object: {
        id: `${this.#activityId}#${questionId}`,
        objectType: 'Activity',
        definition,
      },
      context: {
        registration: this.#registration,
        contextActivities: {
          grouping: [{ id: this.#activityId }],
        },
      },
      result,
      timestamp: new Date().toISOString(),
    };
    const statementsUrl = `${this.#endpoint}statements`;
    this.#xapiFetch(statementsUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(statement),
    }).catch((err) => {
      console.warn('Tessera: Failed to send xAPI answered statement', err);
    });
  }

  commit(): void {
    // No-op — xAPI calls are sent individually per statement
  }

  terminate(): void {
    if (this.#terminated) return;
    this.#terminated = true;
    // Use fetch with keepalive: true to ensure the request survives page unload.
    // This is the recommended approach for xAPI — sendBeacon cannot include
    // the Authorization header required by CMI5.
    const statement = this.#buildStatement(VERBS.terminated);
    const statementsUrl = `${this.#endpoint}statements`;
    const body = JSON.stringify(statement);

    this.#xapiFetch(statementsUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => {
      console.warn('Tessera: Failed to send CMI5 Terminated statement');
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

  #buildStatement(verb: string, result?: object): object {
    const verbName = verb.split('/').pop() || '';
    const statement: any = {
      actor: this.#actor,
      verb: { id: verb, display: { 'en-US': verbName } },
      object: { id: this.#activityId, objectType: 'Activity' },
      context: {
        registration: this.#registration,
        contextActivities: {
          grouping: [{ id: this.#activityId }],
        },
      },
    };
    if (result) {
      statement.result = result;
    }
    return statement;
  }

  async #sendStatement(verb: string, result?: object): Promise<void> {
    const statement = this.#buildStatement(verb, result);
    const url = `${this.#endpoint}statements`;
    try {
      await this.#xapiFetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(statement),
      });
    } catch (err) {
      console.warn(`Tessera: Failed to send xAPI statement (${verb})`, err);
    }
  }

  async #xapiFetch(url: string, options: RequestInit = {}): Promise<Response> {
    const headers = new Headers(options.headers);
    if (this.#authToken) {
      headers.set('Authorization', `Bearer ${this.#authToken}`);
    }
    headers.set('X-Experience-API-Version', '1.0.3');

    return fetch(url, {
      ...options,
      headers,
    });
  }
}
