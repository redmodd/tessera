import { SvelteMap, SvelteSet } from 'svelte/reactivity';
import type { CourseConfig } from './types.js';
import { DEFAULT_PERCENTAGE_THRESHOLD } from './defaults.js';

export class ProgressState {
  #quizGradedIndices: ReadonlySet<number>;
  #config: CourseConfig;
  #totalPages: number;

  constructor(
    quizGradedIndices: ReadonlySet<number>,
    config: CourseConfig,
    totalPages: number,
  ) {
    this.#quizGradedIndices = quizGradedIndices;
    this.#config = config;
    this.#totalPages = totalPages;
  }

  visitedPages = $state(new SvelteSet<number>());
  quizScores = $state(new SvelteMap<number, number>());
  /**
   * Chunk progress — for pages that reveal content in stages (Continue buttons).
   * Maps pageIndex → highest revealed chunk index (0-based).
   */
  chunkProgress = $state(new SvelteMap<number, number>());
  /**
   * Per-page standalone question scores from `useQuestion`. pageIndex → (questionId → score 0-100).
   * Tracked separately from `quizScores` because <Quiz> blocks score as a unit
   * while standalone questions score individually and average per page.
   */
  standaloneQuestionScores = $state(
    new SvelteMap<number, Map<string, number>>(),
  );
  /**
   * Set of page indices that have at least one graded standalone question.
   * Pages in this set contribute to course success status via their standalone average.
   */
  gradedStandalonePages = $state(new SvelteSet<number>());

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

  quizCompleted(pageIndex: number, score: number) {
    this.quizScores.set(pageIndex, score);
    this.version++;
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
    let pageMap = this.standaloneQuestionScores.get(pageIndex);
    if (!pageMap) {
      pageMap = new Map<string, number>();
      this.standaloneQuestionScores.set(pageIndex, pageMap);
    }
    pageMap.set(questionId, score);
    if (graded) {
      this.gradedStandalonePages.add(pageIndex);
    }
    this.version++;
  }

  /** Average of standalone question scores on a page, or 0 if none. */
  getPageStandaloneAverage(pageIndex: number): number {
    const pageMap = this.standaloneQuestionScores.get(pageIndex);
    if (!pageMap || pageMap.size === 0) return 0;
    let sum = 0;
    for (const s of pageMap.values()) sum += s;
    return sum / pageMap.size;
  }

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
          ? (this.visitedPages.size / this.#totalPages) * 100
          : 0;
      return percent >= threshold ? 'complete' : 'incomplete';
    }
    const { indices } = this.#gradedPages();
    if (indices.length === 0) return 'incomplete';
    return this.#gradedAverage(indices) >= this.#config.scoring.passingScore
      ? 'complete'
      : 'incomplete';
  });

  successStatus = $derived.by<'unknown' | 'passed' | 'failed'>(() => {
    if (this.#config.completion.mode === 'manual') {
      const want = this.#config.completion.requireSuccessStatus;
      return this.#manuallyCompleted && want !== undefined ? want : 'unknown';
    }
    const { indices, attempted } = this.#gradedPages();
    if (indices.length === 0 || !attempted) return 'unknown';
    return this.#gradedAverage(indices) >= this.#config.scoring.passingScore
      ? 'passed'
      : 'failed';
  });

  /**
   * Effective graded score for LMS reporting — same union and averaging as
   * successStatus, so score and success status can't disagree.
   */
  gradedScore(): { average: number; attempted: boolean } {
    const { indices, attempted } = this.#gradedPages();
    return { average: this.#gradedAverage(indices), attempted };
  }

  #gradedPages(): { indices: number[]; attempted: boolean } {
    const merged = new Set(this.#quizGradedIndices);
    for (const i of this.gradedStandalonePages) merged.add(i);
    const indices = [...merged];
    const attempted = indices.some((i) => this.#hasScore(i));
    return { indices, attempted };
  }

  #hasScore(pageIndex: number): boolean {
    if (this.quizScores.has(pageIndex)) return true;
    const pageMap = this.standaloneQuestionScores.get(pageIndex);
    return !!pageMap && pageMap.size > 0;
  }

  #gradedAverage(indices: number[]): number {
    if (indices.length === 0) return 0;
    let sum = 0;
    for (const i of indices) {
      sum += this.quizScores.get(i) ?? this.getPageStandaloneAverage(i);
    }
    return sum / indices.length;
  }
}
