import { SCORM2004_INTERACTION_FORMAT } from '../interaction-format.js';
import type { SavedState } from '../persistence.js';
import { BaseScormAdapter, type ScormDialect } from './scorm-base.js';
import {
  formatISO8601Duration,
  formatISO8601Timestamp,
  formatReal107,
} from './format.js';

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
    timestamp: () => formatISO8601Timestamp(new Date()),
    // SCORM 2004 accepts the canonical interaction `type` strings unchanged.
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
 * Per §4.2.1.5, the SCO MUST NOT alter the learner record in `browse` or
 * `review` mode — every write below is gated on `#mode === 'normal'`.
 * `#masteryScore` (§4.2.4.3) is the LMS-supplied pass threshold in [0,1].
 */
export class SCORM2004Adapter extends BaseScormAdapter<SCORM2004API> {
  #mode: SCORM2004Mode = 'normal';
  #masteryScore: number | null = null;

  constructor(api: SCORM2004API) {
    super(api, SCORM2004_DIALECT);
  }

  async init(): Promise<void> {
    await super.init();
    this.#mode = this.#readMode();
    this.#masteryScore = this.#readScaledThreshold('cmi.scaled_passing_score');
  }

  getLaunchMode(): SCORM2004Mode {
    return this.#mode;
  }

  /** Read by App.svelte to override `course.config.js scoring.passingScore`. */
  getMasteryScore(): number | null {
    return this.#masteryScore;
  }

  get #canWrite(): boolean {
    return this.#mode === 'normal';
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
    if (!this.#canWrite) return;
    super.saveState(state);
    // §4.2.1.4 — bookmark for LMS "Resume from page N" affordances.
    this.queue.enqueue(
      () => this.api.SetValue('cmi.location', String(state.b)),
      'cmi.location'
    );
  }

  setDuration(seconds: number): void {
    if (!this.#canWrite) return;
    super.setDuration(seconds);
  }

  reportInteraction(
    questionId: string,
    interaction: import('../interaction.js').Interaction,
    correct: boolean | null
  ): void {
    if (!this.#canWrite) return;
    super.reportInteraction(questionId, interaction, correct);
  }

  setScore(score: number): void {
    if (!this.#canWrite) return;
    const raw = formatReal107(score);
    // §4.2.4.3.5 — score.scaled is bounded to [-1, 1].
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

  setCompletionStatus(status: 'incomplete' | 'complete'): void {
    if (!this.#canWrite) return;
    const value = status === 'complete' ? 'completed' : 'incomplete';
    this.queue.enqueue(
      () => this.api.SetValue('cmi.completion_status', value),
      'cmi.completion_status'
    );
    // §4.2.4.2 — writing 1.0 surfaces a "100%" reading on LMS dashboards.
    if (status === 'complete') {
      this.queue.enqueue(
        () => this.api.SetValue('cmi.progress_measure', '1'),
        'cmi.progress_measure'
      );
    }
  }

  setSuccessStatus(status: 'passed' | 'failed' | 'unknown'): void {
    if (!this.#canWrite) return;
    // Setting "unknown" explicitly prevents SCORM Cloud from rolling up
    // a null status to "passed".
    this.queue.enqueue(
      () => this.api.SetValue('cmi.success_status', status),
      'cmi.success_status'
    );
  }

  setExit(mode: 'suspend' | 'normal'): void {
    if (!this.#canWrite) return;
    this.queue.enqueue(
      () => this.api.SetValue('cmi.exit', mode),
      'cmi.exit'
    );
  }
}
