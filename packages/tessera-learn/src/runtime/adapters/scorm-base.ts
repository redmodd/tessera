import {
  savedJson,
  type CompletionStatus,
  type ExitMode,
  type SavedState,
  type SuccessStatus,
} from '../persistence.js';
import type { Interaction } from '../interaction.js';
import {
  buildScormInteractionFields,
  type ScormInteractionFields,
} from '../interaction-format.js';
import {
  WriteQueue,
  callSyncOrWarn,
  lmsCallSucceeded,
  withRetry,
} from './retry.js';
import type { LMSErrorReporter } from './retry.js';
import { BaseAdapter } from './base.js';
import { parseMastery } from './format.js';
import type { XAPIAgent } from '../xapi/types.js';
import type { CourseConfig } from '../types.js';
import {
  httpOrigin,
  largerSuspendDataStandards,
  type STANDARDS,
} from '../standards.js';

interface ScormCalls {
  initialize: [''];
  terminate: [''];
  getValue: [key: string];
  setValue: [key: string, value: string];
  commit: [''];
  getLastError: [];
  getErrorString: [code: string];
  getDiagnostic: [code: string];
}

type ScormMethod = keyof ScormCalls;

type ApiMethod<TApi, M extends ScormMethod> = {
  [K in keyof TApi]: TApi[K] extends (...args: ScormCalls[M]) => string
    ? K
    : never;
}[keyof TApi];

/**
 * Per-version differences shared between SCORM 1.2 and SCORM 2004 adapters.
 *
 * `methods` maps each call to its `LMS*`-prefixed (1.2) or bare (2004) API
 * name, so the base class can stay version-agnostic.
 */
export interface ScormDialect<TApi> {
  profile: typeof STANDARDS.scorm12 | typeof STANDARDS.scorm2004;
  apiName: string;
  methods: { [M in ScormMethod]: ApiMethod<TApi, M> };
  sessionTimeKey: string;
  masteryKey: string;
  masteryRange: readonly [number, number];
  formatDuration(seconds: number): string;
  interactionFields: ScormInteractionFields;
}

export abstract class BaseScormAdapter<TApi> extends BaseAdapter {
  protected readonly api: TApi;
  protected readonly dialect: ScormDialect<TApi>;
  protected readonly queue = new WriteQueue();
  protected readonly errorReporter: LMSErrorReporter;
  override readonly stateLimit: number;
  #terminated = false;
  #suspendOverflowWarned = false;
  #interactionCount = 0;
  #questionIdsByRecorded = new Map<string, string>();
  readonly #lang: string;

  constructor(api: TApi, dialect: ScormDialect<TApi>, config: CourseConfig) {
    super();
    this.api = api;
    this.dialect = dialect;
    this.#lang = config.language;
    this.stateLimit = dialect.profile.suspendDataLimit;
    this.errorReporter = {
      code: () => this.call('getLastError'),
      message: (c) => this.call('getErrorString', c),
      diagnostic: (c) => this.call('getDiagnostic', c),
    };
    this.queue.errorReporter = this.errorReporter;
  }

  protected call<M extends ScormMethod>(
    method: M,
    ...args: ScormCalls[M]
  ): string {
    const api = this.api as Record<
      keyof TApi,
      (...args: ScormCalls[M]) => string
    >;
    return api[this.dialect.methods[method]](...args);
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
      return this.call('getValue', key);
    } catch {
      return '';
    }
  }

  // SCORM 2004 overrides this to block writes in browse/review mode (§4.2.1.5).
  protected canWrite(): boolean {
    return !this.#terminated;
  }

  protected set(key: string, value: string): void {
    if (!this.canWrite()) return;
    this.queue.enqueue(() => this.call('setValue', key, value), key);
  }

  async init(): Promise<void> {
    const initialized = await withRetry(
      () => this.call('initialize', ''),
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

    const { masteryKey, masteryRange } = this.dialect;
    this.masteryScore = parseMastery(
      this.read(masteryKey),
      masteryKey,
      masteryRange,
    );

    let raw = '';
    try {
      raw = this.call('getValue', 'cmi.suspend_data');
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
      countRaw = this.call('getValue', 'cmi.interactions._count');
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
      this.#interactionCount = n;
    } else {
      console.warn(
        `Tessera: LMS returned non-numeric cmi.interactions._count="${countRaw}"; new interactions will be written from index 0 and may overwrite prior session records`,
      );
    }
  }

  saveState(state: SavedState): void {
    if (!this.canWrite()) return;
    this.state = state;
    const json = savedJson(state);
    if (!this.#suspendOverflowWarned && json.length > this.stateLimit) {
      this.#suspendOverflowWarned = true;
      console.warn(
        `Tessera: cmi.suspend_data is ${json.length} bytes, over the ` +
          `${this.dialect.profile.name} limit of ${this.stateLimit}. The LMS will likely ` +
          `truncate it and the next resume will lose state. Reduce ` +
          `usePersistence() payloads or switch export.standard to a ` +
          `larger-limit standard (${largerSuspendDataStandards(this.stateLimit).join('/')}).`,
      );
    }
    this.set('cmi.suspend_data', json);
  }

  override setDuration(sessionSeconds: number): void {
    this.set(
      this.dialect.sessionTimeKey,
      this.dialect.formatDuration(sessionSeconds),
    );
  }

  override reportInteraction(
    questionId: string,
    interaction: Interaction,
    correct: boolean | null,
    text?: string,
  ): void {
    if (!this.canWrite()) return;
    const description = text
      ? this.dialect.interactionFields.description?.(text, this.#lang)
      : undefined;
    if (description === null) {
      console.warn(
        `Tessera: the description of interaction "${questionId}" is left out of the LMS record: ${this.dialect.profile.name} rejects a second "{lang=" tag after the course language tag. Reword the start of the question.`,
      );
    }
    const { id, fields } = buildScormInteractionFields(
      questionId,
      interaction,
      correct,
      this.dialect.interactionFields,
      this.dialect.profile.interactionFormat,
      description,
    );
    const earlier = this.#questionIdsByRecorded.get(id);
    if (earlier !== undefined && earlier !== questionId) {
      console.warn(
        `Tessera: interactions "${earlier}" and "${questionId}" both record as "${id}" under ${this.dialect.profile.name}, so the LMS record cannot tell them apart. Give them distinct ids of ASCII letters, digits and underscores.`,
      );
    }
    this.#questionIdsByRecorded.set(id, questionId);
    let n: number | null = null;
    const idKey = () => `cmi.interactions.${this.#interactionCount}.id`;
    this.queue.enqueue(() => {
      const result = this.call('setValue', idKey(), id);
      if (lmsCallSucceeded(result)) n = this.#interactionCount++;
      return result;
    }, idKey);
    for (const [suffix, value] of fields) {
      const key = () => `cmi.interactions.${n}.${suffix}`;
      this.queue.enqueue(
        () => n === null || this.call('setValue', key(), value),
        key,
      );
    }
  }

  override commit(): void {
    if (this.#terminated) return;
    this.queue.enqueue(() => this.call('commit', ''), 'Commit');
  }

  override terminate(): void {
    if (this.#terminated) return;
    this.#terminated = true;
    // Async retries can't run during page unload — drain + commit + finish synchronously.
    this.queue.drainSync();
    callSyncOrWarn(() => this.call('commit', ''), 'Commit', this.errorReporter);
    callSyncOrWarn(
      () => this.call('terminate', ''),
      'Terminate',
      this.errorReporter,
    );
  }

  abstract override setScore(score: number): void;
  abstract override setCompletionStatus(status: CompletionStatus): void;
  abstract override setSuccessStatus(
    status: SuccessStatus,
    final?: boolean,
  ): void;
  abstract override setExit(mode: ExitMode): void;
}

/**
 * Search the window.parent chain, then the parent chains of window.opener and window.top.opener, for the dialect's LMS API object.
 * Cross-origin frames are skipped. Returns null if no chain has it within 10 levels.
 */
export function findLMSAPI<TApi>({
  apiName,
  methods,
}: ScormDialect<TApi>): TApi | null {
  function scan(win: Window): TApi | null {
    for (let i = 0; i < 10; i++) {
      try {
        const value = (win as unknown as Record<string, Partial<TApi> | null>)[
          apiName
        ];
        if (typeof value?.[methods.initialize] === 'function') {
          return value as TApi;
        }
      } catch {}
      const parent = win.parent;
      if (!parent || parent === win) break;
      win = parent;
    }
    return null;
  }

  let api = scan(window);
  for (const opener of new Set([window.opener, window.top?.opener])) {
    if (opener) api ??= scan(opener);
  }
  return api;
}
