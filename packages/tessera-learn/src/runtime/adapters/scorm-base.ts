import type {
  CompletionStatus,
  ExitMode,
  SavedState,
  SuccessStatus,
} from '../persistence.js';
import type { Interaction } from '../interaction.js';
import { buildScormInteractionFields } from '../interaction-format.js';
import { WriteQueue, callSyncOrWarn, withRetry } from './retry.js';
import type { LMSErrorReporter } from './retry.js';
import { BaseAdapter } from './base.js';
import { parseScaled01 } from './format.js';
import type { XAPIAgent } from '../xapi/types.js';
import {
  httpOrigin,
  largerSuspendDataStandards,
  type STANDARDS,
} from '../standards.js';

/**
 * Per-version differences shared between SCORM 1.2 and SCORM 2004 adapters.
 *
 * The `LMS*`-prefixed (1.2) vs bare (2004) method names are abstracted here
 * so the base class can stay version-agnostic.
 */
export interface ScormDialect<TApi> {
  profile: typeof STANDARDS.scorm12 | typeof STANDARDS.scorm2004;
  sessionTimeKey: string;
  masteryKey: string;
  masteryScale: number;
  formatDuration(seconds: number): string;
  interactionFields: {
    responseField: 'student_response' | 'learner_response';
    timestampField: 'time' | 'timestamp';
    timestamp(): string;
    typeValue(type: Interaction['type']): string;
    resultLabels: { correct: string; incorrect: string };
  };
  initialize(api: TApi): string;
  terminate(api: TApi): string;
  getValue(api: TApi, key: string): string;
  setValue(api: TApi, key: string, value: string): string;
  commit(api: TApi): string;
  getLastError(api: TApi): string;
  getErrorString(api: TApi, code: string): string;
  getDiagnostic(api: TApi, code: string): string;
}

export abstract class BaseScormAdapter<TApi> extends BaseAdapter {
  protected readonly api: TApi;
  protected readonly dialect: ScormDialect<TApi>;
  protected readonly queue = new WriteQueue();
  protected readonly errorReporter: LMSErrorReporter;
  #terminated = false;
  #suspendOverflowWarned = false;
  protected interactionCount = 0;

  constructor(api: TApi, dialect: ScormDialect<TApi>) {
    super();
    this.api = api;
    this.dialect = dialect;
    this.errorReporter = {
      code: () => this.dialect.getLastError(this.api),
      message: (c) => this.dialect.getErrorString(this.api, c),
      diagnostic: (c) => this.dialect.getDiagnostic(this.api, c),
    };
    this.queue.errorReporter = this.errorReporter;
  }

  /**
   * `{ account: { homePage, name: <learner id> }, name: <learner name> }`.
   * `homePage` defaults to the activityId origin so analytics keyed on actor
   * identity stay stable across LMS hosts; the author's `actorAccountHomePage`
   * overrides it when the authority namespace is elsewhere. Null when the LMS
   * has no learner id or no homePage can be derived.
   */
  override deriveActor(
    activityId: string,
    actorAccountHomePage?: string,
  ): XAPIAgent | null {
    const { learnerIdField, learnerNameField } = this.dialect.profile;
    const id = this.read(learnerIdField);
    const homePage = actorAccountHomePage ?? httpOrigin(activityId);
    if (!id || !homePage) return null;
    const agent: XAPIAgent = {
      account: { homePage, name: id },
      objectType: 'Agent',
    };
    const name = this.read(learnerNameField);
    if (name) agent.name = name;
    return agent;
  }

  protected read(key: string): string {
    try {
      return String(this.dialect.getValue(this.api, key) ?? '');
    } catch {
      return '';
    }
  }

  // SCORM 2004 overrides this to block writes in browse/review mode (§4.2.1.5).
  protected canWrite(): boolean {
    return true;
  }

  protected set(key: string, value: string): void {
    if (!this.canWrite()) return;
    this.queue.enqueue(() => this.dialect.setValue(this.api, key, value), key);
  }

  async init(): Promise<void> {
    const initialized = await withRetry(
      () => this.dialect.initialize(this.api),
      undefined,
      this.errorReporter,
      'Initialize',
    );
    if (!initialized) {
      console.warn(
        'Tessera: LMS Initialize failed — all subsequent persistence calls will fail with error 301 (Not Initialized). Reload the launch from the LMS.',
      );
      return;
    }

    const { masteryKey, masteryScale } = this.dialect;
    const mastery = this.read(masteryKey);
    this.masteryScore = parseScaled01(mastery, masteryScale);
    if (this.masteryScore === null && mastery.trim()) {
      console.warn(
        `Tessera: ${masteryKey} is not a number in [0,${masteryScale}] (got "${mastery}"); using scoring.passingScore.`,
      );
    }

    let raw = '';
    try {
      raw = this.dialect.getValue(this.api, 'cmi.suspend_data');
    } catch (err) {
      console.warn(
        'Tessera: LMS threw on GetValue(cmi.suspend_data); resume disabled for this launch',
        err,
      );
    }
    if (raw && raw.trim()) {
      try {
        this.state = JSON.parse(raw);
      } catch (err) {
        console.warn(
          'Tessera: cmi.suspend_data is not valid JSON; resume disabled for this launch (the LMS may have truncated a prior write)',
          err,
        );
      }
    }

    // n indexing must continue from _count — restarting at 0 would overwrite
    // the prior session's records (the LMS uses n as the array key).
    let countRaw: string;
    try {
      countRaw = this.dialect.getValue(this.api, 'cmi.interactions._count');
    } catch (err) {
      console.warn(
        'Tessera: LMS threw on GetValue(cmi.interactions._count); new interactions will be written from index 0 and may overwrite prior session records',
        err,
      );
      return;
    }
    if (countRaw === '' || countRaw === '0') return;
    const n = parseInt(countRaw, 10);
    if (Number.isFinite(n) && n >= 0) {
      this.interactionCount = n;
    } else {
      console.warn(
        `Tessera: LMS returned non-numeric cmi.interactions._count="${countRaw}"; new interactions will be written from index 0 and may overwrite prior session records`,
      );
    }
  }

  saveState(state: SavedState): void {
    if (!this.canWrite()) return;
    this.state = state;
    const json = JSON.stringify(state);
    const { name, suspendDataLimit } = this.dialect.profile;
    if (!this.#suspendOverflowWarned && json.length > suspendDataLimit) {
      this.#suspendOverflowWarned = true;
      console.warn(
        `Tessera: cmi.suspend_data is ${json.length} chars, over the ` +
          `${name} cmi.suspend_data ${suspendDataLimit}-char limit. The LMS will likely ` +
          `truncate it and the next resume will lose state. Reduce ` +
          `usePersistence() payloads or switch export.standard to a ` +
          `larger-limit standard (${largerSuspendDataStandards(suspendDataLimit).join('/')}).`,
      );
    }
    this.set('cmi.suspend_data', json);
  }

  override setDuration(seconds: number): void {
    this.set(this.dialect.sessionTimeKey, this.dialect.formatDuration(seconds));
  }

  override reportInteraction(
    questionId: string,
    interaction: Interaction,
    correct: boolean | null,
  ): void {
    if (!this.canWrite()) return;
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
        format: this.dialect.profile.interactionFormat,
      },
    );
    for (const [key, value] of fields) {
      this.set(key, value);
    }
  }

  override commit(): void {
    this.queue.enqueue(() => this.dialect.commit(this.api), 'Commit');
  }

  override terminate(): void {
    if (this.#terminated) return;
    this.#terminated = true;
    // Async retries can't run during page unload — drain + commit + finish synchronously.
    this.queue.drainSync();
    callSyncOrWarn(
      () => this.dialect.commit(this.api),
      'Commit',
      this.errorReporter,
    );
    callSyncOrWarn(
      () => this.dialect.terminate(this.api),
      'Terminate',
      this.errorReporter,
    );
  }

  abstract override setScore(score: number): void;
  abstract override setCompletionStatus(status: CompletionStatus): void;
  abstract override setSuccessStatus(status: SuccessStatus): void;
  abstract override setExit(mode: ExitMode): void;
}
