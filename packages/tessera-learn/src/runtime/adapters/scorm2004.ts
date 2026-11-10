import type {
  CompletionStatus,
  ExitMode,
  SavedState,
  SuccessStatus,
} from '../persistence.js';
import {
  BaseScormAdapter,
  findLMSAPI,
  type ScormDialect,
} from './scorm-base.js';
import {
  formatISO8601Duration,
  formatISO8601Timestamp,
  formatReal107,
  toScaled,
} from './format.js';
import { STANDARDS } from '../standards.js';
import { cutText } from '../interaction-format.js';
import type { CourseConfig } from '../types.js';

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

// Moodle rejects the whole description when more than 8 characters follow the
// primary language, so the tag loses its extensions and private use, then
// subtags from the end until it fits: `ca-ES-valencia` → `ca-ES`.
function descriptionLang(lang: string): string {
  const subtags = new Intl.Locale(lang).baseName.split('-');
  while (subtags.slice(1).join('-').length > 8) subtags.pop();
  return subtags.join('-');
}

const SCORM2004_DIALECT: ScormDialect<SCORM2004API> = {
  profile: STANDARDS.scorm2004,
  apiName: 'API_1484_11',
  methods: {
    initialize: 'Initialize',
    terminate: 'Terminate',
    getValue: 'GetValue',
    setValue: 'SetValue',
    commit: 'Commit',
    getLastError: 'GetLastError',
    getErrorString: 'GetErrorString',
    getDiagnostic: 'GetDiagnostic',
  },
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
  // localized_string_type, SPM 250 after the tag. Text starting with `{lang=` is rejected even after a tag.
  interactionDescription: (text, lang) =>
    text.startsWith('{lang=')
      ? null
      : `{lang=${descriptionLang(lang)}}${cutText(text, 250)}`,
};

/** SCORM 2004 4E §4.2.1.5 cmi.mode vocabulary. */
export type SCORM2004Mode = 'browse' | 'normal' | 'review';

/**
 * Per §4.2.1.5, the SCO MUST NOT alter the learner record in `browse` or
 * `review` mode: every write below is gated on `#mode === 'normal'`.
 */
export class SCORM2004Adapter extends BaseScormAdapter<SCORM2004API> {
  #mode: SCORM2004Mode = 'normal';
  #exitMode: ExitMode = 'suspend';

  static connect(config: CourseConfig): SCORM2004Adapter | null {
    const api = findLMSAPI(SCORM2004_DIALECT);
    return api ? new SCORM2004Adapter(api, config) : null;
  }

  constructor(api: SCORM2004API, config: CourseConfig) {
    super(api, SCORM2004_DIALECT, config);
  }

  override async init(): Promise<void> {
    await super.init();
    this.#mode = this.#readMode();
  }

  protected override canWrite(): boolean {
    return super.canWrite() && this.#mode === 'normal';
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
    this.set('cmi.score.scaled', formatReal107(toScaled(score)));
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
    this.set('cmi.success_status', status);
  }

  setExit(mode: ExitMode): void {
    this.#exitMode = mode;
    this.set('cmi.exit', mode);
  }

  override exit(deadline: Promise<unknown>): Promise<void> {
    const request = this.#exitMode === 'suspend' ? 'suspendAll' : 'exitAll';
    this.queue.enqueue(
      () => this.call('setValue', 'adl.nav.request', request),
      'adl.nav.request',
    );
    return super.exit(deadline);
  }
}
