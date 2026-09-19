import { untrack } from 'svelte';
import { SvelteMap, SvelteSet } from 'svelte/reactivity';
import type { Manifest } from '../plugin/manifest.js';
import type { CourseConfig } from './types.js';
import type { CompletionStatus, SuccessStatus } from './persistence.js';
import { DEFAULT_PERCENTAGE_THRESHOLD } from './defaults.js';

export interface StandaloneResult {
  score: number;
  weight: number;
  graded: boolean;
}

export function normalizeWeight(weight: unknown): number {
  return typeof weight === 'number' && Number.isFinite(weight) && weight > 0
    ? weight
    : 1;
}

export function weightedScore(
  entries: { score: number; weight: number }[],
): number {
  let weighted = 0;
  let totalWeight = 0;
  for (const { score, weight } of entries) {
    weighted += score * weight;
    totalWeight += weight;
  }
  if (totalWeight === 0) return 0;
  const mean = weighted / totalWeight;
  return Math.round(Number((mean * 100).toPrecision(15))) / 100;
}

/**
 * Score state for one gradable page. A page can carry both a <Quiz> and
 * standalone `useQuestion` answers; `quizScore` wins when it does.
 */
export interface GradedUnit {
  /** Best score across attempts, or undefined until the quiz is submitted. */
  quizScore?: number;
  /** Submitted quiz attempts. Persisted so `maxAttempts` survives a resume. */
  attempts: number;
  /** Standalone question results, questionId → score 0-100 + rollup weight. */
  questions?: Map<string, StandaloneResult>;
}

export class ProgressState {
  #declaredGradedIndices: ReadonlySet<number>;
  #quizGradedIndices: ReadonlySet<number>;
  #config: CourseConfig;
  #totalPages: number;
  #quizPageIndices: ReadonlySet<number>;
  #pageWeights: ReadonlyMap<number, number>;
  #undeclaredWarned = new Set<number>();

  constructor(manifest: Manifest, config: CourseConfig) {
    this.#declaredGradedIndices = new Set(
      manifest.pages
        .filter((p) => p.quiz?.graded || p.graded)
        .map((p) => p.index),
    );
    this.#quizGradedIndices = new Set(
      manifest.pages.filter((p) => p.quiz?.graded).map((p) => p.index),
    );
    this.#quizPageIndices = new Set(
      manifest.pages.filter((p) => p.quiz).map((p) => p.index),
    );
    this.#pageWeights = new Map(
      manifest.pages.map((p) => [p.index, normalizeWeight(p.weight)]),
    );
    this.#totalPages = manifest.totalPages;
    this.#config = config;
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
    this.#changed();
  }

  markVisited(pageIndex: number) {
    if (this.visitedPages.has(pageIndex)) return;
    this.visitedPages.add(pageIndex);
    this.#changed();
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
    this.#changed();
  }

  /** Highest chunk revealed on a page, or -1 if none. */
  getChunk(pageIndex: number): number {
    return this.chunkProgress.get(pageIndex) ?? -1;
  }

  assertDeclaredGraded(pageIndex: number, slug: string) {
    if (this.#declaredGradedIndices.has(pageIndex)) return;
    const message = `Tessera: page "${slug}" has a graded question but does not declare pageConfig.graded: true, so it will not count toward the course score or passed/failed. Add graded: true to its pageConfig.`;
    if (import.meta.env?.DEV) throw new Error(message);
    if (this.#undeclaredWarned.has(pageIndex)) return;
    this.#undeclaredWarned.add(pageIndex);
    console.warn(message);
  }

  markStandaloneQuestion(
    pageIndex: number,
    questionId: string,
    score: number,
    graded: boolean,
    weight?: number,
  ) {
    const questions =
      this.gradedUnits.get(pageIndex)?.questions ??
      new Map<string, StandaloneResult>();
    questions.set(questionId, {
      score,
      weight: normalizeWeight(weight),
      graded,
    });
    this.#writeQuestions(pageIndex, questions);
  }

  /**
   * Correct a restored answer's `graded` flag and weight from the mounted
   * component, which outranks what the save was written with.
   * ponytail: only pages the learner reopens are corrected; a full sweep needs
   * build-time extraction, which can't see custom question components.
   */
  refreshStandaloneQuestion(
    pageIndex: number,
    questionId: string,
    graded: boolean,
    weight?: number,
  ) {
    const questions = this.gradedUnits.get(pageIndex)?.questions;
    const result = questions?.get(questionId);
    if (!questions || !result) return;
    const next = normalizeWeight(weight);
    if (next === result.weight && graded === result.graded) return;
    questions.set(questionId, { ...result, weight: next, graded });
    this.#writeQuestions(pageIndex, questions);
  }

  pageScore(pageIndex: number): number | undefined {
    const unit = this.gradedUnits.get(pageIndex);
    if (this.#quizGradedIndices.has(pageIndex) && unit?.quizScore !== undefined)
      return unit.quizScore;
    return this.#gradedResults(pageIndex).length
      ? this.getPageStandaloneAverage(pageIndex)
      : undefined;
  }

  #writeQuestions(pageIndex: number, questions: Map<string, StandaloneResult>) {
    this.#write(pageIndex, { questions });
  }

  #gradedResults(pageIndex: number): StandaloneResult[] {
    const questions = this.gradedUnits.get(pageIndex)?.questions;
    return questions
      ? [...questions.values()].filter((result) => result.graded)
      : [];
  }

  /** Weighted mean of graded standalone scores on a page, or 0 if none. */
  getPageStandaloneAverage(pageIndex: number): number {
    return weightedScore(this.#gradedResults(pageIndex));
  }

  // Replaces the entry rather than mutating it: SvelteMap tracks the value it
  // holds for a key, not the fields of that value.
  #write(pageIndex: number, patch: Partial<GradedUnit>) {
    this.gradedUnits.set(pageIndex, {
      attempts: 0,
      ...this.gradedUnits.get(pageIndex),
      ...patch,
    });
    this.#changed();
  }

  #graded = $derived.by(() => {
    const entries: { score: number; weight: number }[] = [];
    let attempted = false;
    let allScored = true;
    for (const pageIndex of this.#declaredGradedIndices) {
      const score = this.pageScore(pageIndex);
      if (score !== undefined) attempted = true;
      else allScored = false;
      entries.push({
        score: score ?? 0,
        weight: this.#pageWeights.get(pageIndex) ?? 1,
      });
    }
    return {
      count: entries.length,
      average: weightedScore(entries),
      attempted,
      allScored,
    };
  });

  #gradedScoreDecided = $state(false);

  get gradedScoreDecided(): boolean {
    return this.#gradedScoreDecided;
  }

  get gradedScoreFinal(): boolean {
    const { count, allScored } = this.#graded;
    return (
      count > 0 &&
      (this.#gradedScoreDecided ||
        allScored ||
        this.completionStatus === 'complete')
    );
  }

  restoreGradedScoreDecided(): void {
    this.#gradedScoreDecided = true;
  }

  #changed() {
    this.version++;
    if (!this.#gradedScoreDecided && untrack(() => this.gradedScoreFinal))
      this.#gradedScoreDecided = true;
  }

  completionStatus = $derived.by<CompletionStatus>(() => {
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
      if (this.awaitingScore(i)) continue;
      count++;
    }
    return count;
  });

  awaitingScore(pageIndex: number): boolean {
    if (
      this.#quizPageIndices.has(pageIndex) &&
      this.quizScore(pageIndex) === undefined
    )
      return true;
    return (
      this.#declaredGradedIndices.has(pageIndex) &&
      this.pageScore(pageIndex) === undefined
    );
  }

  successStatus = $derived.by<SuccessStatus>(() => {
    if (this.#config.completion.mode === 'manual') {
      const want = this.#config.completion.requireSuccessStatus;
      return this.#manuallyCompleted && want !== undefined ? want : 'unknown';
    }
    if (!this.gradedScoreFinal) return 'unknown';
    const { average } = this.#graded;
    return average >= this.#config.scoring.passingScore ? 'passed' : 'failed';
  });

  /**
   * Effective graded score for LMS reporting — same union and averaging as
   * successStatus, so score and success status can't disagree.
   */
  get gradedScore(): { average: number; attempted: boolean } {
    const { average, attempted } = this.#graded;
    return { average, attempted };
  }
}
