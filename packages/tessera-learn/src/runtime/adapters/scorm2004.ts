import type {
  CompletionStatus,
  ExitMode,
  SavedState,
  SuccessStatus,
} from '../persistence.js';
import { BaseScormAdapter, type ScormDialect } from './scorm-base.js';
import {
  formatISO8601Duration,
  formatISO8601Timestamp,
  formatReal107,
} from './format.js';
import { STANDARDS } from '../standards.js';

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
  profile: STANDARDS.scorm2004,
  sessionTimeKey: 'cmi.session_time',
  masteryKey: 'cmi.scaled_passing_score',
  masteryRange: [-1, 1],
  formatDuration: formatISO8601Duration,
  interactionFields: {
    responseField: 'learner_response',
    timestampField: 'timestamp',
    timestamp: () => formatISO8601Timestamp(new Date()),
    // SCORM 2004 accepts the canonical interaction `type` strings unchanged.
    typeValue: (t) => t,
    resultLabels: { correct: 'correct', incorrect: 'incorrect' },
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
 * `review` mode: every write below is gated on `#mode === 'normal'`.
 */
export class SCORM2004Adapter extends BaseScormAdapter<SCORM2004API> {
  #mode: SCORM2004Mode = 'normal';

  constructor(api: SCORM2004API) {
    super(api, SCORM2004_DIALECT);
  }

  override async init(): Promise<void> {
    await super.init();
    this.#mode = this.#readMode();
  }

  protected override canWrite(): boolean {
    return this.#mode === 'normal';
  }

  #readMode(): SCORM2004Mode {
    const v = this.read('cmi.mode');
    return v === 'browse' || v === 'review' ? v : 'normal';
  }

  override saveState(state: SavedState): void {
    super.saveState(state);
    // §4.2.1.4 — bookmark for LMS "Resume from page N" affordances.
    this.set('cmi.location', String(state.b));
  }

  setScore(score: number): void {
    this.set('cmi.score.raw', formatReal107(score));
    this.set('cmi.score.min', '0');
    this.set('cmi.score.max', '100');
    // §4.2.4.3.5 — score.scaled is bounded to [-1, 1].
    this.set(
      'cmi.score.scaled',
      formatReal107(Math.max(0, Math.min(1, score / 100))),
    );
  }

  setCompletionStatus(status: CompletionStatus): void {
    this.set(
      'cmi.completion_status',
      status === 'complete' ? 'completed' : 'incomplete',
    );
    // §4.2.4.2 — writing 1.0 surfaces a "100%" reading on LMS dashboards.
    if (status === 'complete') this.set('cmi.progress_measure', '1');
  }

  setSuccessStatus(status: SuccessStatus): void {
    // Setting "unknown" explicitly prevents SCORM Cloud from rolling up
    // a null status to "passed".
    this.set('cmi.success_status', status);
  }

  setExit(mode: ExitMode): void {
    this.set('cmi.exit', mode);
  }
}
