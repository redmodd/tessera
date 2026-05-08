import type { Manifest } from '../plugin/manifest.js';
import type { CourseConfig } from './types.js';

export class ProgressState {
  visitedPages = $state(new Set<number>());
  quizScores = $state(new Map<number, number>());
  /**
   * Chunk progress — for pages that reveal content in stages (Continue buttons).
   * Maps pageIndex → highest revealed chunk index (0-based).
   */
  chunkProgress = $state(new Map<number, number>());
  /**
   * Per-page standalone question scores from `useQuestion`. pageIndex → (questionId → score 0-100).
   * Tracked separately from `quizScores` because <Quiz> blocks score as a unit
   * while standalone questions score individually and average per page.
   */
  standaloneQuestionScores = $state(new Map<number, Map<string, number>>());
  /**
   * Set of page indices that have at least one graded standalone question.
   * Pages in this set contribute to course success status via their standalone average.
   */
  gradedStandalonePages = $state(new Set<number>());
  completionStatus = $state<'incomplete' | 'complete'>('incomplete');
  successStatus = $state<'unknown' | 'passed' | 'failed'>('unknown');

  /**
   * Monotonic counter incremented on every persistable state mutation
   * (visited/scores/chunks/standalone). Callers that need to react to *any*
   * progress change can subscribe to this single signal instead of iterating
   * each Map/Set themselves.
   */
  version = $state(0);

  /**
   * Mark a page as visited. Callers must call recalculateCompletion()
   * afterward to update completionStatus.
   */
  markVisited(pageIndex: number) {
    if (this.visitedPages.has(pageIndex)) return;
    this.visitedPages.add(pageIndex);
    this.version++;
  }

  /**
   * Record a quiz score. Callers must call recalculateCompletion()
   * and recalculateSuccess() afterward to update status fields.
   */
  quizCompleted(pageIndex: number, score: number) {
    this.quizScores.set(pageIndex, score);
    this.version++;
  }

  /**
   * Record the highest chunk index revealed on a page. Idempotent — only
   * advances forward, never backward.
   */
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

  /**
   * Record the score for a single standalone question (one created via
   * `useQuestion` outside a `<Quiz>`). When `graded`, the page is added to
   * `gradedStandalonePages` so it contributes to course success.
   */
  markStandaloneQuestion(
    pageIndex: number,
    questionId: string,
    score: number,
    graded: boolean
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

  recalculateCompletion(manifest: Manifest, config: CourseConfig) {
    if (config.completion.mode === 'percentage') {
      const threshold = config.completion.percentageThreshold ?? 100;
      const percent = manifest.totalPages > 0
        ? (this.visitedPages.size / manifest.totalPages) * 100
        : 0;
      this.completionStatus = percent >= threshold ? 'complete' : 'incomplete';
    } else if (config.completion.mode === 'quiz') {
      const { indices } = this.#gradedPages(manifest);
      if (indices.length === 0) {
        this.completionStatus = 'incomplete';
        return;
      }
      const average = this.#gradedAverage(indices);
      this.completionStatus = average >= config.scoring.passingScore ? 'complete' : 'incomplete';
    }
  }

  recalculateSuccess(manifest: Manifest, config: CourseConfig) {
    const { indices, attempted } = this.#gradedPages(manifest);

    if (indices.length === 0) {
      this.successStatus = 'unknown';
      return;
    }
    // Stay unknown until at least one graded score has been recorded
    if (!attempted) {
      this.successStatus = 'unknown';
      return;
    }
    const average = this.#gradedAverage(indices);
    this.successStatus = average >= config.scoring.passingScore ? 'passed' : 'failed';
  }

  /**
   * Union of pages that contribute to graded scoring: pageConfig graded quizzes
   * plus pages with at least one graded standalone question (deduped).
   * `attempted` is true if any of those pages has a recorded score.
   */
  #gradedPages(manifest: Manifest): { indices: number[]; attempted: boolean } {
    const quizPages = manifest.pages.filter(p => p.quiz?.graded).map(p => p.index);
    const indices = [...new Set([...quizPages, ...this.gradedStandalonePages])];
    const attempted = indices.some(i => this.#hasScore(i));
    return { indices, attempted };
  }

  /** Whether a page has any recorded graded score (quiz or standalone). */
  #hasScore(pageIndex: number): boolean {
    if (this.quizScores.has(pageIndex)) return true;
    const pageMap = this.standaloneQuestionScores.get(pageIndex);
    return !!pageMap && pageMap.size > 0;
  }

  /**
   * Average across the given page indices. Each page contributes its quiz score
   * if present, otherwise its standalone average. Pages with no recorded score
   * contribute 0 (matching the existing "unattempted graded quiz = 0" rule).
   */
  #gradedAverage(indices: number[]): number {
    if (indices.length === 0) return 0;
    let sum = 0;
    for (const i of indices) {
      sum += this.quizScores.get(i) ?? this.getPageStandaloneAverage(i);
    }
    return sum / indices.length;
  }
}
