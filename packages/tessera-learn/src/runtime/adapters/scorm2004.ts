import { SCORM2004_INTERACTION_FORMAT } from '../interaction-format.js';
import type { SavedState } from '../persistence.js';
import { BaseScormAdapter, type ScormDialect } from './scorm-base.js';
import { formatISO8601Duration, formatReal107 } from './retry.js';

/**
 * SCORM 2004 API interface.
 */
export interface SCORM2004API {
  Initialize(param: string): string;
  Terminate(param: string): string;
  GetValue(element: string): string;
  SetValue(element: string, value: string): string;
  Commit(param: string): string;
  GetLastError(): string;
  GetErrorString(errorCode: string): string;
  GetDiagnostic(errorCode: string): string;
}

const SCORM2004_DIALECT: ScormDialect<SCORM2004API> = {
  sessionTimeKey: 'cmi.session_time',
  formatDuration: formatISO8601Duration,
  suspendDataLimit: 64000,
  suspendDataLimitLabel: 'SCORM 2004 4E cmi.suspend_data 64000-char',
  interactionFields: {
    responseField: 'learner_response',
    timestampField: 'timestamp',
    timestamp: () => new Date().toISOString(),
    typeValue: (t) => t,
    resultLabels: { correct: 'correct', incorrect: 'incorrect' },
    format: SCORM2004_INTERACTION_FORMAT,
  },
  initialize: (api) => api.Initialize(''),
  terminate: (api) => api.Terminate(''),
  getValue: (api, key) => api.GetValue(key),
  setValue: (api, key, value) => api.SetValue(key, value),
  commit: (api) => api.Commit(''),
  getLastError: (api) => api.GetLastError(),
  getErrorString: (api, code) => api.GetErrorString(code),
  getDiagnostic: (api, code) => api.GetDiagnostic(code),
};

/** SCORM 2004 4E §4.2.1.5 cmi.mode vocabulary. */
export type SCORM2004Mode = 'browse' | 'normal' | 'review';

/**
 * SCORM 2004 persistence adapter.
 *
 * Uses a sequential write queue for all LMS SetValue/Commit calls.
 * On terminate, the queue is drained synchronously (single attempt)
 * since async retries cannot complete during page unload.
 */
export class SCORM2004Adapter extends BaseScormAdapter<SCORM2004API> {
  /**
   * SCORM 2004 4E §4.2.1.5 — the LMS may launch in `browse` or `review`
   * mode. Per the spec, the SCO MUST NOT alter the learner's record in
   * those modes (the LMS uses them to preview the SCO or replay an
   * existing attempt). Mirrors cmi5's launchMode handling.
   */
  #mode: SCORM2004Mode = 'normal';
  /** §4.2.4.3 — LMS-supplied passing threshold (scaled in [0,1]). */
  #masteryScore: number | null = null;
  /** §4.2.4.4 — LMS-supplied completion threshold (scaled in [0,1]). */
  #completionThreshold: number | null = null;

  constructor(api: SCORM2004API) {
    super(api, SCORM2004_DIALECT);
  }

  async init(): Promise<void> {
    await super.init();
    this.#mode = this.#readMode();
    this.#masteryScore = this.#readScaledThreshold('cmi.scaled_passing_score');
    this.#completionThreshold = this.#readScaledThreshold(
      'cmi.completion_threshold'
    );
  }

  /** Current launch mode. Callers should treat anything other than `normal` as read-only. */
  getLaunchMode(): SCORM2004Mode {
    return this.#mode;
  }

  /**
   * LMS-supplied `cmi.scaled_passing_score` as a decimal in [0, 1], or null
   * when omitted. Read by App.svelte to override `course.config.js
   * scoring.passingScore` for this launch — parity with cmi5's launch-time
   * `masteryScore`.
   */
  getMasteryScore(): number | null {
    return this.#masteryScore;
  }

  /** LMS-supplied `cmi.completion_threshold` as a decimal in [0, 1], or null. */
  getCompletionThreshold(): number | null {
    return this.#completionThreshold;
  }

  #readMode(): SCORM2004Mode {
    try {
      const v = this.api.GetValue('cmi.mode');
      if (v === 'browse' || v === 'review' || v === 'normal') return v;
    } catch {}
    return 'normal';
  }

  #readScaledThreshold(key: string): number | null {
    let raw = '';
    try {
      raw = this.api.GetValue(key);
    } catch {
      return null;
    }
    if (!raw) return null;
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 0 && n <= 1) return n;
    return null;
  }

  saveState(state: SavedState): void {
    // §4.2.1.5 — browse/review launches MUST NOT alter the learner record,
    // and cmi.suspend_data is part of that record.
    if (this.#mode !== 'normal') return;
    super.saveState(state);
    // §4.2.1.4 cmi.location — bookmark of where the learner left off.
    // Tessera persists everything inside cmi.suspend_data, but writing a
    // value here surfaces "Resume from page N" affordances in LMS UIs and
    // is harmless when no UI consumes it.
    this.queue.enqueue(
      () => this.api.SetValue('cmi.location', String(state.b)),
      'cmi.location'
    );
  }

  setDuration(seconds: number): void {
    if (this.#mode !== 'normal') return;
    super.setDuration(seconds);
  }

  reportInteraction(
    questionId: string,
    interaction: import('../interaction.js').Interaction,
    correct: boolean | null
  ): void {
    if (this.#mode !== 'normal') return;
    super.reportInteraction(questionId, interaction, correct);
  }

  setScore(score: number): void {
    if (this.#mode !== 'normal') return;
    const raw = formatReal107(score);
    // §4.2.4.3.5 — score.scaled must be in [-1, 1]; we clamp the [0,100]
    // raw score to [0,1] for the scaled field.
    const scaled = formatReal107(Math.max(0, Math.min(1, score / 100)));
    this.queue.enqueue(
      () => this.api.SetValue('cmi.score.raw', raw),
      'cmi.score.raw'
    );
    this.queue.enqueue(
      () => this.api.SetValue('cmi.score.min', '0'),
      'cmi.score.min'
    );
    this.queue.enqueue(
      () => this.api.SetValue('cmi.score.max', '100'),
      'cmi.score.max'
    );
    this.queue.enqueue(
      () => this.api.SetValue('cmi.score.scaled', scaled),
      'cmi.score.scaled'
    );
  }

  // Note: cmi.completion_threshold and cmi.scaled_passing_score are typically
  // set by the LMS, not the SCO. Tessera reads them in init() (above) and
  // exposes them via getMasteryScore/getCompletionThreshold; the SCO writes
  // its own outcome via cmi.completion_status / cmi.success_status / score.
  setCompletionStatus(status: 'incomplete' | 'complete'): void {
    if (this.#mode !== 'normal') return;
    const value = status === 'complete' ? 'completed' : 'incomplete';
    this.queue.enqueue(
      () => this.api.SetValue('cmi.completion_status', value),
      'cmi.completion_status'
    );
    // §4.2.4.2 cmi.progress_measure — [0,1] scaled progress. Writing 1
    // on completion gives LMS dashboards a sensible "100% complete" value
    // even when tessera hasn't been streaming intermediate progress.
    if (status === 'complete') {
      this.queue.enqueue(
        () => this.api.SetValue('cmi.progress_measure', '1'),
        'cmi.progress_measure'
      );
    }
  }

  setSuccessStatus(status: 'passed' | 'failed' | 'unknown'): void {
    if (this.#mode !== 'normal') return;
    // "unknown" is a valid SCORM 2004 value — setting it explicitly prevents
    // LMSes (notably SCORM Cloud) from rolling up a null status to "passed".
    this.queue.enqueue(
      () => this.api.SetValue('cmi.success_status', status),
      'cmi.success_status'
    );
  }

  setExit(mode: 'suspend' | 'normal'): void {
    if (this.#mode !== 'normal') return;
    // SCORM 2004 §4.2 cmi.exit vocabulary: time-out, suspend, logout, normal, "".
    this.queue.enqueue(
      () => this.api.SetValue('cmi.exit', mode),
      'cmi.exit'
    );
  }
}
