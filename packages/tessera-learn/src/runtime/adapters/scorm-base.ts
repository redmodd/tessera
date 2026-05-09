/**
 * Shared SCORM 1.2 / 2004 adapter machinery.
 *
 * The two SCORM standards share ~90% of their adapter logic — what differs
 * is the API method *names* (`LMSInitialize` vs `Initialize`), the CMI
 * *element names* (`cmi.core.score.raw` vs `cmi.score.raw`), the duration
 * format (HHMMSS vs ISO8601), and a handful of completion/success
 * vocabulary mappings. This file owns everything else (the WriteQueue,
 * suspend_data save/restore, interaction-count restoration, terminate
 * lifecycle) so neither subclass has to duplicate it.
 *
 * Subclasses provide a `ScormDialect` describing their version's quirks;
 * `setScore` / `setCompletionStatus` / `setSuccessStatus` / `setExit`
 * remain abstract because their CMI write patterns diverge enough that a
 * lookup table would obscure rather than clarify (notably SCORM 1.2's
 * lesson_status combines completion + success into one field).
 */
import type { PersistenceAdapter, SavedState } from '../persistence.js';
import type { Interaction } from '../interaction.js';
import { buildScormInteractionFields } from '../interaction-format.js';
import { WriteQueue, callSync, withRetry } from './retry.js';

/** Per-version differences shared between SCORM 1.2 and SCORM 2004 adapters. */
export interface ScormDialect<TApi> {
  /** SCORM 1.2: `cmi.core.session_time`. SCORM 2004: `cmi.session_time`. */
  sessionTimeKey: string;
  /** Format `seconds` for the session-time field — HHMMSS for 1.2, ISO8601 for 2004. */
  formatDuration(seconds: number): string;
  /** Per-interaction-row field config passed to `buildScormInteractionFields`. */
  interactionFields: {
    responseField: 'student_response' | 'learner_response';
    timestampField: 'time' | 'timestamp';
    /** Build the per-call timestamp string (HH:MM:SS for 1.2, ISO8601 for 2004). */
    timestamp(): string;
    typeValue(type: Interaction['type']): string;
    resultLabels: { correct: string; incorrect: string };
  };
  /** API method wrappers — abstract over the `LMS*`-prefixed and bare names. */
  initialize(api: TApi): string;
  terminate(api: TApi): string;
  getValue(api: TApi, key: string): string;
  setValue(api: TApi, key: string, value: string): string;
  commit(api: TApi): string;
  getLastError(api: TApi): string;
  getErrorString(api: TApi, code: string): string;
}

/**
 * Abstract base for SCORM persistence adapters. Owns the queue, suspend_data
 * (de)serialization, interaction indexing, and the unload-time drain. Concrete
 * subclasses override the per-version write paths that diverge between SCORM
 * 1.2 and 2004.
 */
export abstract class BaseScormAdapter<TApi> implements PersistenceAdapter {
  protected readonly api: TApi;
  protected readonly dialect: ScormDialect<TApi>;
  protected readonly queue = new WriteQueue();
  #state: SavedState | null = null;
  #terminated = false;
  protected interactionCount = 0;

  constructor(api: TApi, dialect: ScormDialect<TApi>) {
    this.api = api;
    this.dialect = dialect;
    // Wire up GetLastError/GetErrorString so retry warnings can name the
    // real LMS failure (e.g. "201 Invalid argument error") instead of a
    // generic "LMS call failed" — production triage needs the code.
    this.queue.errorReporter = {
      code: () => this.dialect.getLastError(this.api),
      message: (c) => this.dialect.getErrorString(this.api, c),
    };
  }

  /** Expose the underlying SCORM API so xAPI actor synthesis can read learner fields. */
  getAPI(): TApi {
    return this.api;
  }

  async init(): Promise<void> {
    await withRetry(() => this.dialect.initialize(this.api));

    try {
      const raw = this.dialect.getValue(this.api, 'cmi.suspend_data');
      if (raw && raw.trim()) {
        this.#state = JSON.parse(raw);
      }
    } catch {
      this.#state = null;
    }

    // Continue cmi.interactions.n indexing where the previous session left
    // off. Restarting at 0 would overwrite prior records (the LMS uses n
    // as the array key, not an upsert field).
    try {
      const count = this.dialect.getValue(this.api, 'cmi.interactions._count');
      const n = parseInt(count, 10);
      if (Number.isFinite(n) && n >= 0) this.interactionCount = n;
    } catch {
      // Some LMSes throw on _count when no interactions exist — fall back to 0.
    }
  }

  getState(): SavedState | null {
    return this.#state;
  }

  saveState(state: SavedState): void {
    this.#state = state;
    const json = JSON.stringify(state);
    this.queue.enqueue(() =>
      this.dialect.setValue(this.api, 'cmi.suspend_data', json)
    );
  }

  setDuration(seconds: number): void {
    const formatted = this.dialect.formatDuration(seconds);
    this.queue.enqueue(() =>
      this.dialect.setValue(this.api, this.dialect.sessionTimeKey, formatted)
    );
  }

  reportInteraction(
    questionId: string,
    interaction: Interaction,
    correct: boolean | null
  ): void {
    const n = this.interactionCount++;
    const fields = buildScormInteractionFields(
      `cmi.interactions.${n}`,
      questionId,
      interaction,
      correct,
      {
        responseField: this.dialect.interactionFields.responseField,
        timestampField: this.dialect.interactionFields.timestampField,
        timestamp: this.dialect.interactionFields.timestamp(),
        typeValue: this.dialect.interactionFields.typeValue(interaction.type),
        resultLabels: this.dialect.interactionFields.resultLabels,
      }
    );
    for (const [key, value] of fields) {
      this.queue.enqueue(() => this.dialect.setValue(this.api, key, value));
    }
  }

  commit(): void {
    this.queue.enqueue(() => this.dialect.commit(this.api));
  }

  terminate(): void {
    if (this.#terminated) return;
    this.#terminated = true;
    // During page unload, async retries can't run.
    // Drain any pending queue operations synchronously (single attempt each),
    // then commit and finish synchronously.
    this.queue.drainSync();
    callSync(() => this.dialect.commit(this.api));
    callSync(() => this.dialect.terminate(this.api));
  }

  // The four operations that genuinely diverge between SCORM versions.
  abstract setScore(score: number): void;
  abstract setCompletionStatus(status: 'incomplete' | 'complete'): void;
  abstract setSuccessStatus(status: 'passed' | 'failed' | 'unknown'): void;
  abstract setExit(mode: 'suspend' | 'normal'): void;
}
