import type { PersistenceAdapter, SavedState } from '../persistence.js';
import type { Interaction } from '../interaction.js';
import {
  buildScormInteractionFields,
  type InteractionFormat,
} from '../interaction-format.js';
import { WriteQueue, callSyncOrWarn, withRetry } from './retry.js';
import type { LMSErrorReporter } from './retry.js';

/** Per-version differences shared between SCORM 1.2 and SCORM 2004 adapters. */
export interface ScormDialect<TApi> {
  /** SCORM 1.2: `cmi.core.session_time`. SCORM 2004: `cmi.session_time`. */
  sessionTimeKey: string;
  /** Format `seconds` for the session-time field — HHMMSS for 1.2, ISO8601 for 2004. */
  formatDuration(seconds: number): string;
  /**
   * Per-spec maximum byte length for `cmi.suspend_data` (SCORM 1.2 RTE
   * §3.4.5.2 = 4096; SCORM 2004 4E §4.2 = 64000). Used by `saveState` to
   * warn once when the serialized payload would be silently truncated by
   * the LMS. Treated as "characters" since SCORM data-model lengths are
   * specified in characters and Tessera stores ASCII-safe JSON.
   */
  suspendDataLimit: number;
  /** Human label for the limit warning, e.g. "SCORM 1.2 (4096 chars)". */
  suspendDataLimitLabel: string;
  /** Per-interaction-row field config passed to `buildScormInteractionFields`. */
  interactionFields: {
    responseField: 'student_response' | 'learner_response';
    timestampField: 'time' | 'timestamp';
    /** Build the per-call timestamp string (HH:MM:SS for 1.2, ISO8601 for 2004). */
    timestamp(): string;
    typeValue(type: Interaction['type']): string;
    resultLabels: { correct: string; incorrect: string };
    /** Response/pattern encoding (delimiters, identifier sanitization). */
    format: InteractionFormat;
  };
  /** API method wrappers — abstract over the `LMS*`-prefixed and bare names. */
  initialize(api: TApi): string;
  terminate(api: TApi): string;
  getValue(api: TApi, key: string): string;
  setValue(api: TApi, key: string, value: string): string;
  commit(api: TApi): string;
  getLastError(api: TApi): string;
  getErrorString(api: TApi, code: string): string;
  /** Optional verbose diagnostic — LMSGetDiagnostic / GetDiagnostic. */
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
    // Wire up GetLastError/GetErrorString/GetDiagnostic so retry warnings
    // can name the real LMS failure (e.g. "201 Invalid argument error —
    // cmi.interactions.0.student_response invalid CMIFeedback") instead
    // of a generic "LMS call failed". Production triage needs the code
    // AND the diagnostic to identify the offending element.
    this.errorReporter = {
      code: () => this.dialect.getLastError(this.api),
      message: (c) => this.dialect.getErrorString(this.api, c),
      diagnostic: this.dialect.getDiagnostic
        ? (c) => this.dialect.getDiagnostic!(this.api, c)
        : undefined,
    };
    this.queue.errorReporter = this.errorReporter;
  }

  /** Expose the underlying SCORM API so xAPI actor synthesis can read learner fields. */
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
      // withRetry already logged the LMS error code; add a top-level note
      // so the developer understands the downstream silence: every later
      // SetValue will also fail with error 301 (Not Initialized).
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

    // Continue cmi.interactions.n indexing where the previous session left
    // off. Restarting at 0 would overwrite prior records (the LMS uses n
    // as the array key, not an upsert field), so a silent fallback here
    // is genuinely dangerous — warn loudly.
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
    // During page unload, async retries can't run.
    // Drain any pending queue operations synchronously (single attempt each),
    // then commit and finish synchronously. The terminate path is the last
    // chance to persist this session's data — log loudly on failure since
    // the user is about to navigate away and won't see a second chance.
    this.queue.drainSync();
    callSyncOrWarn(() => this.dialect.commit(this.api), 'Commit', this.errorReporter);
    callSyncOrWarn(
      () => this.dialect.terminate(this.api),
      'Terminate',
      this.errorReporter
    );
  }

  // The four operations that genuinely diverge between SCORM versions.
  abstract setScore(score: number): void;
  abstract setCompletionStatus(status: 'incomplete' | 'complete'): void;
  abstract setSuccessStatus(status: 'passed' | 'failed' | 'unknown'): void;
  abstract setExit(mode: 'suspend' | 'normal'): void;
}
