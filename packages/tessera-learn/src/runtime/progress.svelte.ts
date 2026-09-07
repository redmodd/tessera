import { SvelteMap, SvelteSet } from 'svelte/reactivity';
import type { CourseConfig } from './types.js';
import { DEFAULT_PERCENTAGE_THRESHOLD } from './defaults.js';

/**
 * Score state for one gradable page. A page can carry both a <Quiz> and
 * standalone `useQuestion` answers; `quizScore` wins when it does.
 */
export interface GradedUnit {
  /** Best score across attempts, or undefined until the quiz is submitted. */
  quizScore?: number;
  /** Submitted quiz attempts. Persisted so `maxAttempts` survives a resume. */
  attempts: number;
  /** Standalone question scores, questionId → score 0-100. */
  questions?: SvelteMap<string, number>;
  /** The page carries at least one graded standalone question. */
  graded: boolean;
}

export class ProgressState {
  #quizGradedIndices: ReadonlySet<number>;
  #config: CourseConfig;
  #totalPages: number;
  #quizPageIndices: ReadonlySet<number>;

  constructor(
    quizGradedIndices: ReadonlySet<number>,
    config: CourseConfig,
    totalPages: number,
    quizPageIndices: ReadonlySet<number>,
  ) {
    this.#quizGradedIndices = quizGradedIndices;
    this.#config = config;
    this.#totalPages = totalPages;
    this.#quizPageIndices = quizPageIndices;
  }

  visitedPages = $state(new SvelteSet<number>());

  /**
   * Chunk progress — for pages that reveal content in stages (Continue buttons).
   * Maps pageIndex → highest revealed chunk index (0-based).
   */
  chunkProgress = $state(new SvelteMap<number, number>());

  gradedUnits = $state(new SvelteMap<number, GradedUnit>());

  // Latch for manual completion. Monotonic; only flips forward.
  #manuallyCompleted = $state(false);

  /**
   * Monotonic counter incremented on every persistable state mutation. App.svelte
   * subscribes to this single signal to schedule a coalesced save.
   */
  version = $state(0);

  get manuallyCompleted(): boolean {
    return this.#manuallyCompleted;
  }

  get passingScore(): number {
    return this.#config.scoring.passingScore;
  }

  /** Idempotent — only the first call per session has an effect. */
  markCompleteManually(): void {
    if (this.#manuallyCompleted) return;
    this.#manuallyCompleted = true;
    this.version++;
  }

  markVisited(pageIndex: number) {
    if (this.visitedPages.has(pageIndex)) return;
    this.visitedPages.add(pageIndex);
    this.version++;
  }

  quizScore(pageIndex: number): number | undefined {
    return this.gradedUnits.get(pageIndex)?.quizScore;
  }

  quizAttempts(pageIndex: number): number {
    return this.gradedUnits.get(pageIndex)?.attempts ?? 0;
  }

  /** Records the learner's best score across attempts, not the latest. */
  quizCompleted(pageIndex: number, score: number) {
    const unit = this.gradedUnits.get(pageIndex);
    this.#write(pageIndex, {
      quizScore:
        unit?.quizScore === undefined ? score : Math.max(unit.quizScore, score),
      attempts: (unit?.attempts ?? 0) + 1,
    });
  }

  /** Seed a quiz page from saved state, without counting a new attempt. */
  restoreQuiz(pageIndex: number, score: number, attempts: number) {
    this.#write(pageIndex, {
      quizScore: score,
      ...(attempts > 0 ? { attempts } : {}),
    });
  }

  /** Record the highest chunk index revealed on a page. Only advances forward. */
  markChunk(pageIndex: number, chunkIndex: number) {
    const current = this.chunkProgress.get(pageIndex) ?? -1;
    if (chunkIndex <= current) return;
    this.chunkProgress.set(pageIndex, chunkIndex);
    this.version++;
  }

  /** Highest chunk revealed on a page, or -1 if none. */
  getChunk(pageIndex: number): number {
    return this.chunkProgress.get(pageIndex) ?? -1;
  }

  markStandaloneQuestion(
    pageIndex: number,
    questionId: string,
    score: number,
    graded: boolean,
  ) {
    const unit = this.gradedUnits.get(pageIndex);
    const questions = unit?.questions ?? new SvelteMap<string, number>();
    questions.set(questionId, score);
    this.#write(pageIndex, { questions, graded: graded || !!unit?.graded });
  }

  /** Average of standalone question scores on a page, or 0 if none. */
  getPageStandaloneAverage(pageIndex: number): number {
    const questions = this.gradedUnits.get(pageIndex)?.questions;
    if (!questions || questions.size === 0) return 0;
    let sum = 0;
    for (const s of questions.values()) sum += s;
    return sum / questions.size;
  }

  // Replaces the entry rather than mutating it: SvelteMap tracks the value it
  // holds for a key, not the fields of that value.
  #write(pageIndex: number, patch: Partial<GradedUnit>) {
    this.gradedUnits.set(pageIndex, {
      attempts: 0,
      graded: false,
      ...this.gradedUnits.get(pageIndex),
      ...patch,
    });
    this.version++;
  }

  #graded = $derived.by<{ count: number; average: number; attempted: boolean }>(
    () => {
      const pages = new Set(this.#quizGradedIndices);
      for (const [pageIndex, unit] of this.gradedUnits) {
        if (unit.graded) pages.add(pageIndex);
      }
      let sum = 0;
      let attempted = false;
      for (const pageIndex of pages) {
        const unit = this.gradedUnits.get(pageIndex);
        if (unit?.quizScore !== undefined || unit?.questions?.size) {
          attempted = true;
        }
        sum += unit?.quizScore ?? this.getPageStandaloneAverage(pageIndex);
      }
      return {
        count: pages.size,
        average: pages.size > 0 ? sum / pages.size : 0,
        attempted,
      };
    },
  );

  completionStatus = $derived.by<'incomplete' | 'complete'>(() => {
    if (this.#manuallyCompleted) return 'complete';
    const mode = this.#config.completion.mode;
    if (mode === 'manual') return 'incomplete';
    if (mode === 'percentage') {
      const threshold =
        this.#config.completion.percentageThreshold ??
        DEFAULT_PERCENTAGE_THRESHOLD;
      const percent =
        this.#totalPages > 0
          ? (this.completedPages / this.#totalPages) * 100
          : 0;
      return percent >= threshold ? 'complete' : 'incomplete';
    }
    const { count, average } = this.#graded;
    if (count === 0) return 'incomplete';
    return average >= this.#config.scoring.passingScore
      ? 'complete'
      : 'incomplete';
  });

  completedPages = $derived.by<number>(() => {
    let count = 0;
    for (const i of this.visitedPages) {
      if (this.#quizPageIndices.has(i) && this.quizScore(i) === undefined) {
        continue;
      }
      count++;
    }
    return count;
  });

  successStatus = $derived.by<'unknown' | 'passed' | 'failed'>(() => {
    if (this.#config.completion.mode === 'manual') {
      const want = this.#config.completion.requireSuccessStatus;
      return this.#manuallyCompleted && want !== undefined ? want : 'unknown';
    }
    const { count, average, attempted } = this.#graded;
    if (count === 0 || !attempted) return 'unknown';
    return average >= this.#config.scoring.passingScore ? 'passed' : 'failed';
  });

  /**
   * Effective graded score for LMS reporting — same union and averaging as
   * successStatus, so score and success status can't disagree.
   */
  gradedScore(): { average: number; attempted: boolean } {
    const { average, attempted } = this.#graded;
    return { average, attempted };
  }
}
