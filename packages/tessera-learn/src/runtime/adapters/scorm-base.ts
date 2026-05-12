import type { PersistenceAdapter, SavedState } from '../persistence.js';
import type { Interaction } from '../interaction.js';
import {
  buildScormInteractionFields,
  type InteractionFormat,
} from '../interaction-format.js';
import { WriteQueue, callSyncOrWarn, withRetry } from './retry.js';
import type { LMSErrorReporter } from './retry.js';

/**
 * Per-version differences shared between SCORM 1.2 and SCORM 2004 adapters.
 *
 * `suspendDataLimit` is per-spec characters: SCORM 1.2 RTE §3.4.5.2 = 4096;
 * SCORM 2004 4E §4.2 = 64000. The `LMS*`-prefixed (1.2) vs bare (2004)
 * method names are abstracted here so the base class can stay version-
 * agnostic.
 */
export interface ScormDialect<TApi> {
  sessionTimeKey: string;
  formatDuration(seconds: number): string;
  suspendDataLimit: number;
  suspendDataLimitLabel: string;
  interactionFields: {
    responseField: 'student_response' | 'learner_response';
    timestampField: 'time' | 'timestamp';
    timestamp(): string;
    typeValue(type: Interaction['type']): string;
    resultLabels: { correct: string; incorrect: string };
    format: InteractionFormat;
  };
  initialize(api: TApi): string;
  terminate(api: TApi): string;
  getValue(api: TApi, key: string): string;
  setValue(api: TApi, key: string, value: string): string;
  commit(api: TApi): string;
  getLastError(api: TApi): string;
  getErrorString(api: TApi, code: string): string;
  getDiagnostic?(api: TApi, code: string): string;
}

export abstract class BaseScormAdapter<TApi> implements PersistenceAdapter {
  protected readonly api: TApi;
  protected readonly dialect: ScormDialect<TApi>;
  protected readonly queue = new WriteQueue();
  protected readonly errorReporter: LMSErrorReporter;
  #state: SavedState | null = null;
  #terminated = false;
  #suspendOverflowWarned = false;
  protected interactionCount = 0;

  constructor(api: TApi, dialect: ScormDialect<TApi>) {
    this.api = api;
    this.dialect = dialect;
    this.errorReporter = {
      code: () => this.dialect.getLastError(this.api),
      message: (c) => this.dialect.getErrorString(this.api, c),
      diagnostic: this.dialect.getDiagnostic
        ? (c) => this.dialect.getDiagnostic!(this.api, c)
        : undefined,
    };
    this.queue.errorReporter = this.errorReporter;
  }

  /** Exposed for xAPI actor synthesis (reads learner fields off the API). */
  getAPI(): TApi {
    return this.api;
  }

  async init(): Promise<void> {
    const initialized = await withRetry(
      () => this.dialect.initialize(this.api),
      undefined,
      this.errorReporter,
      'Initialize'
    );
    if (!initialized) {
      console.warn(
        'Tessera: LMS Initialize failed — all subsequent persistence calls will fail with error 301 (Not Initialized). Reload the launch from the LMS.'
      );
      return;
    }

    let raw = '';
    try {
      raw = this.dialect.getValue(this.api, 'cmi.suspend_data');
    } catch (err) {
      console.warn(
        'Tessera: LMS threw on GetValue(cmi.suspend_data); resume disabled for this launch',
        err
      );
    }
    if (raw && raw.trim()) {
      try {
        this.#state = JSON.parse(raw);
      } catch (err) {
        console.warn(
          'Tessera: cmi.suspend_data is not valid JSON; resume disabled for this launch (the LMS may have truncated a prior write)',
          err
        );
        this.#state = null;
      }
    }

    // n indexing must continue from _count — restarting at 0 would overwrite
    // the prior session's records (the LMS uses n as the array key).
    let countRaw = '';
    try {
      countRaw = this.dialect.getValue(this.api, 'cmi.interactions._count');
    } catch (err) {
      console.warn(
        'Tessera: LMS threw on GetValue(cmi.interactions._count); new interactions will be written from index 0 and may overwrite prior session records',
        err
      );
      return;
    }
    if (countRaw === '' || countRaw === '0') return;
    const n = parseInt(countRaw, 10);
    if (Number.isFinite(n) && n >= 0) {
      this.interactionCount = n;
    } else {
      console.warn(
        `Tessera: LMS returned non-numeric cmi.interactions._count="${countRaw}"; new interactions will be written from index 0 and may overwrite prior session records`
      );
    }
  }

  getState(): SavedState | null {
    return this.#state;
  }

  saveState(state: SavedState): void {
    this.#state = state;
    const json = JSON.stringify(state);
    if (
      !this.#suspendOverflowWarned &&
      json.length > this.dialect.suspendDataLimit
    ) {
      this.#suspendOverflowWarned = true;
      console.warn(
        `Tessera: cmi.suspend_data is ${json.length} chars, over the ` +
          `${this.dialect.suspendDataLimitLabel} limit. The LMS will likely ` +
          `truncate it and the next resume will lose state. Reduce ` +
          `usePersistence() payloads or switch export.standard to a ` +
          `larger-limit standard (scorm2004/cmi5).`
      );
    }
    this.queue.enqueue(
      () => this.dialect.setValue(this.api, 'cmi.suspend_data', json),
      'cmi.suspend_data'
    );
  }

  setDuration(seconds: number): void {
    const formatted = this.dialect.formatDuration(seconds);
    this.queue.enqueue(
      () =>
        this.dialect.setValue(this.api, this.dialect.sessionTimeKey, formatted),
      this.dialect.sessionTimeKey
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
        format: this.dialect.interactionFields.format,
      }
    );
    for (const [key, value] of fields) {
      this.queue.enqueue(
        () => this.dialect.setValue(this.api, key, value),
        key
      );
    }
  }

  commit(): void {
    this.queue.enqueue(() => this.dialect.commit(this.api), 'Commit');
  }

  terminate(): void {
    if (this.#terminated) return;
    this.#terminated = true;
    // Async retries can't run during page unload — drain + commit + finish synchronously.
    this.queue.drainSync();
    callSyncOrWarn(() => this.dialect.commit(this.api), 'Commit', this.errorReporter);
    callSyncOrWarn(
      () => this.dialect.terminate(this.api),
      'Terminate',
      this.errorReporter
    );
  }

  abstract setScore(score: number): void;
  abstract setCompletionStatus(status: 'incomplete' | 'complete'): void;
  abstract setSuccessStatus(status: 'passed' | 'failed' | 'unknown'): void;
  abstract setExit(mode: 'suspend' | 'normal'): void;
}
