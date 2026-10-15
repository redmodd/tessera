import { untrack } from 'svelte';
import { SvelteMap, SvelteSet } from 'svelte/reactivity';
import type { Manifest } from '../plugin/manifest.js';
import {
  isGradedPage,
  isPageIndex,
  isRecord,
  isRequiredGradedPage,
  resolveSuccess,
  type CourseConfig,
  type SuccessConfig,
} from './types.js';
import {
  jsonSize,
  type CompletionStatus,
  type GradedUnitState,
  type SavedQuestion,
  type SavedState,
  type SuccessStatus,
} from './persistence.js';
import { DEFAULT_PERCENTAGE_THRESHOLD } from './defaults.js';

type SavedProgress = Pick<SavedState, 'v' | 'g' | 'c' | 'm' | 's' | 'k' | 'p'>;

export interface StandaloneResult {
  score: number;
  weight: number;
  graded: boolean;
  /** Retries spent before the submit that scored. */
  retries: number;
  /** The submit's verdict, or null when its response had no `correct` to judge it by. */
  correct: boolean | null;
  /** The submitted response, as JSON. */
  response?: string;
  /** Graded, with no retry left to change the score. */
  final: boolean;
}

/** What a standalone submit records beside its score. */
export interface StandaloneSubmit {
  /** Retries spent before the submit. */
  retries?: number;
  response?: unknown;
  /** The verdict, or null when the response had no `correct` to judge it by. Default: what the score gives. */
  correct?: boolean | null;
  /** No retries are left. A score of 100 is final either way. */
  final?: boolean;
}

/** What a standalone question last submitted, for the handle a remount seeds. */
export interface StandaloneRestore extends Pick<
  StandaloneResult,
  'score' | 'retries' | 'correct'
> {
  response?: unknown;
}

const WHOLE_NUMBER = /^(0|[1-9]\d{0,14})$/;
const isWholeNumber = {
  string: (id: unknown) => typeof id === 'string' && WHOLE_NUMBER.test(id),
  number: (id: unknown) =>
    typeof id === 'number' && Number.isInteger(id) && id >= 0 && id < 1e15,
};

/**
 * A response's saved form, and the response back from it. Ids that are whole
 * numbers, which is all the built-in widgets emit, are saved as numbers:
 * `[["0","2"]]` becomes `[[0,2]]`. A response already made of whole numbers
 * takes the string form in exchange, so the two cannot be mistaken on the way
 * back; anything else is saved as written.
 */
function swapIds(response: unknown): unknown {
  if (!Array.isArray(response)) return response;
  const ids: unknown[] = response.flat();
  if (ids.length === 0) return response;
  const to = ids.every(isWholeNumber.string)
    ? Number
    : ids.every(isWholeNumber.number)
      ? String
      : undefined;
  if (!to) return response;
  const swap = (id: unknown): unknown => to(id);
  return response.map((entry: unknown) =>
    Array.isArray(entry) ? entry.map(swap) : swap(entry),
  );
}

/** A response as JSON, or undefined when it has none. */
function encodeResponse(response: unknown): string | undefined {
  try {
    return JSON.stringify(response);
  } catch {
    return undefined;
  }
}

function savedResponse(encoded: string): unknown {
  return swapIds(JSON.parse(encoded));
}

function encodeResponses(
  responses: Iterable<[string, unknown]>,
): Map<string, string> | undefined {
  const encoded = new Map<string, string>();
  for (const [questionId, response] of responses) {
    const json = encodeResponse(response);
    if (json !== undefined) encoded.set(questionId, json);
  }
  return encoded.size > 0 ? encoded : undefined;
}

function normalizeRetries(retries: unknown): number {
  return typeof retries === 'number' && Number.isInteger(retries) && retries > 0
    ? retries
    : 0;
}

export function normalizeWeight(weight: unknown): number {
  return typeof weight === 'number' && Number.isFinite(weight) && weight > 0
    ? weight
    : 1;
}

/** A question with `retries` spent can still retry under `maxRetries`. */
export function retriesLeft(retries: number, maxRetries?: number): boolean {
  return retries < (maxRetries ?? Infinity);
}

export function clampScore(score: number): number {
  return Number.isFinite(score) ? Math.min(100, Math.max(0, score)) : 0;
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
  /** The best quiz attempt's responses, questionId → encoded response. */
  responses?: ReadonlyMap<string, string>;
}

export class ProgressState {
  #declaredGradedIndices: ReadonlySet<number>;
  #requiredGradedIndices: ReadonlySet<number>;
  #quizMaxAttempts: ReadonlyMap<number, number>;
  #config: CourseConfig;
  #success: SuccessConfig;
  #totalPages: number;
  #quizPageIndices: ReadonlySet<number>;
  #pageWeights: ReadonlyMap<number, number>;
  #listedQuestions: ReadonlyMap<number, ReadonlySet<string>>;
  #undeclaredWarned = new Set<number>();
  #expected: SvelteMap<number, ReadonlySet<string>>;
  #unconfirmed = new Map<number, Set<string>>();

  constructor(manifest: Manifest, config: CourseConfig) {
    this.#declaredGradedIndices = new Set(
      manifest.pages.filter(isGradedPage).map((p) => p.index),
    );
    this.#requiredGradedIndices = new Set(
      manifest.pages.filter(isRequiredGradedPage).map((p) => p.index),
    );
    this.#quizMaxAttempts = new Map(
      manifest.pages.flatMap((p) =>
        p.quiz?.graded
          ? [[p.index, p.quiz.maxAttempts ?? Infinity] as const]
          : [],
      ),
    );
    this.#quizPageIndices = new Set(
      manifest.pages.filter((p) => p.quiz).map((p) => p.index),
    );
    this.#pageWeights = new Map(
      manifest.pages.map((p) => [p.index, normalizeWeight(p.weight)]),
    );
    this.#listedQuestions = new Map(
      manifest.pages.flatMap((p) =>
        p.questions ? [[p.index, new Set(p.questions)] as const] : [],
      ),
    );
    this.#expected = new SvelteMap(this.#listedQuestions);
    this.#totalPages = manifest.totalPages;
    this.#config = config;
    this.#success = resolveSuccess(config);
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
   * Monotonic counter incremented on every persistable state mutation. CourseSession
   * subscribes to this single signal to schedule a coalesced save.
   */
  version = $state(0);

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
    if (!isPageIndex(pageIndex, this.#totalPages)) return;
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

  quizResponses(pageIndex: number): Map<string, unknown> {
    const responses = this.gradedUnits.get(pageIndex)?.responses ?? [];
    return new Map(
      [...responses].map(([questionId, response]) => [
        questionId,
        JSON.parse(response),
      ]),
    );
  }

  /**
   * Records the learner's best score across attempts, not the latest, and the
   * responses that earned it.
   */
  quizCompleted(
    pageIndex: number,
    score: number,
    responses: Iterable<[string, unknown]> = [],
  ) {
    const unit = this.gradedUnits.get(pageIndex);
    const best = unit?.quizScore === undefined || score >= unit.quizScore;
    this.#write(pageIndex, {
      attempts: (unit?.attempts ?? 0) + 1,
      ...(best
        ? { quizScore: score, responses: encodeResponses(responses) }
        : {}),
    });
  }

  /** Record the highest chunk index revealed on a page. Only advances forward. */
  markChunk(pageIndex: number, chunkIndex: number) {
    if (!isPageIndex(pageIndex, this.#totalPages)) return;
    if (!Number.isInteger(chunkIndex)) return;
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
    { retries, response, correct, final }: StandaloneSubmit = {},
  ) {
    const questions =
      this.gradedUnits.get(pageIndex)?.questions ??
      new Map<string, StandaloneResult>();
    const clamped = clampScore(score);
    questions.set(questionId, {
      score: clamped,
      weight: normalizeWeight(weight),
      graded,
      retries: normalizeRetries(retries),
      correct: correct === undefined ? clamped >= 100 : correct,
      response: encodeResponse(response),
      final: graded && (clamped >= 100 || final === true),
    });
    this.#writeQuestions(pageIndex, questions);
  }

  standaloneResult(
    pageIndex: number,
    questionId: string,
  ): StandaloneRestore | undefined {
    const result = this.gradedUnits.get(pageIndex)?.questions?.get(questionId);
    return (
      result && {
        score: result.score,
        retries: result.retries,
        correct: result.correct,
        response:
          result.response === undefined
            ? undefined
            : JSON.parse(result.response),
      }
    );
  }

  /**
   * Record a mounted question, so its page counts as answered only once every
   * graded question on it is, and correct a restored answer's `graded` flag,
   * weight and finality from it, which outrank what the save was written with. The
   * manifest lists the built-in questions the source fixes, so only a custom
   * or dynamically identified one behind a reveal waits to register.
   * ponytail: only pages the learner opens are corrected; a full sweep needs
   * each question's weight at build time, which custom question components hide.
   */
  registerStandaloneQuestion(
    pageIndex: number,
    questionId: string,
    graded: boolean,
    weight?: number,
    maxRetries?: number,
  ) {
    this.#unconfirmed.get(pageIndex)?.delete(questionId);
    const expectedChanged = this.#expect(pageIndex, [questionId], graded);
    const questions = this.gradedUnits.get(pageIndex)?.questions;
    const result = questions?.get(questionId);
    if (questions && result) {
      const next = normalizeWeight(weight);
      const final =
        graded &&
        (result.score >= 100 || !retriesLeft(result.retries, maxRetries));
      if (
        next !== result.weight ||
        graded !== result.graded ||
        final !== result.final
      ) {
        questions.set(questionId, { ...result, weight: next, graded, final });
        this.#writeQuestions(pageIndex, questions);
        return;
      }
    }
    if (expectedChanged) this.#changed();
  }

  pageMounted(pageIndex: number) {
    const stale = this.#unconfirmed.get(pageIndex);
    if (!stale) return;
    this.#unconfirmed.delete(pageIndex);
    const listed = this.#listedQuestions.get(pageIndex);
    const unlisted = [...stale].filter((id) => !listed?.has(id));
    if (this.#expect(pageIndex, unlisted, false)) this.#changed();
  }

  /** Unanswered graded questions the manifest doesn't list, which a save carries until they register again. */
  #unlistedUnanswered(pageIndex: number): string[] {
    const questions = this.gradedUnits.get(pageIndex)?.questions;
    const listed = this.#listedQuestions.get(pageIndex);
    return [...(this.#expected.get(pageIndex) ?? [])].filter(
      (id) => !questions?.get(id)?.graded && !listed?.has(id),
    );
  }

  #allAnswered(pageIndex: number): boolean {
    const questions = this.gradedUnits.get(pageIndex)?.questions;
    for (const id of this.#expected.get(pageIndex) ?? []) {
      if (!questions?.get(id)?.graded) return false;
    }
    return true;
  }

  #expect(
    pageIndex: number,
    questionIds: string[],
    expected: boolean,
  ): boolean {
    const before = this.#expected.get(pageIndex);
    const ids = new Set(before);
    for (const id of questionIds) {
      if (expected) ids.add(id);
      else ids.delete(id);
    }
    if (ids.size === (before?.size ?? 0)) return false;
    this.#expected.set(pageIndex, ids);
    return true;
  }

  #answeredScore(pageIndex: number): number | undefined {
    if (this.#allAnswered(pageIndex)) return this.pageScore(pageIndex);
    return this.#quizMaxAttempts.has(pageIndex)
      ? this.quizScore(pageIndex)
      : undefined;
  }

  pageScore(pageIndex: number): number | undefined {
    const unit = this.gradedUnits.get(pageIndex);
    if (this.#quizMaxAttempts.has(pageIndex) && unit?.quizScore !== undefined)
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
      const score = this.#answeredScore(pageIndex);
      if (score !== undefined) attempted = true;
      else if (this.#requiredGradedIndices.has(pageIndex)) allScored = false;
      else continue;
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

  /** No attempt or retry left can change the page's score. */
  #pageFinal(pageIndex: number): boolean {
    const maxAttempts = this.#quizMaxAttempts.get(pageIndex);
    if (maxAttempts !== undefined) {
      const unit = this.gradedUnits.get(pageIndex);
      return (
        unit?.quizScore !== undefined &&
        (unit.quizScore >= 100 || unit.attempts >= maxAttempts)
      );
    }
    const results = this.#gradedResults(pageIndex);
    return (
      this.#allAnswered(pageIndex) &&
      results.length > 0 &&
      results.every((result) => result.final)
    );
  }

  /**
   * True once no graded page, optional ones included, can change its score,
   * so the verdict stands.
   */
  verdictFinal = $derived.by(
    () =>
      this.#declaredGradedIndices.size > 0 &&
      [...this.#declaredGradedIndices].every((i) => this.#pageFinal(i)),
  );

  #gradedScoreDecided = $state(false);

  get gradedScoreFinal(): boolean {
    const { count, allScored } = this.#graded;
    return (
      count > 0 &&
      (this.#gradedScoreDecided ||
        allScored ||
        this.completionStatus === 'complete')
    );
  }

  #completionReached = $state(false);
  #passScore = $state<number | null>(null);

  #replaying = false;

  /**
   * Answers are saved while `answerBudget` bytes last and left out after
   * that: a standalone question then restores scored without its answer, and
   * a quiz, which is reviewed whole, without any of its answers.
   */
  toSaved(answerBudget = Infinity): SavedProgress {
    let budget = answerBudget;
    // Measures nothing while the budget has no end.
    const afford = (cost: () => number): boolean => {
      if (budget === Infinity) return true;
      const bytes = cost();
      if (bytes > budget) return false;
      budget -= bytes;
      return true;
    };
    const g: Record<string, GradedUnitState> = {};
    for (const [pageIndex, unit] of this.gradedUnits) {
      const entry: GradedUnitState = {};
      if (unit.quizScore !== undefined) entry.s = unit.quizScore;
      if (unit.attempts > 1) entry.a = unit.attempts;
      if (unit.questions?.size) {
        entry.q = Object.fromEntries(
          [...unit.questions].map(([qid, result]) => {
            const { score, weight, retries, response, correct } = result;
            const verdict =
              correct === null ? 2 : correct === score >= 100 ? 0 : 4;
            const final = result.final && score < 100 ? 8 : 0;
            const flags = (result.graded ? 1 : 0) + verdict + final;
            const bare: number | SavedQuestion =
              retries > 0
                ? [score, weight, flags, retries]
                : flags === 1 && weight === 1
                  ? score
                  : [score, weight, flags];
            if (response === undefined) return [qid, bare];
            const answered: SavedQuestion = [
              score,
              weight,
              flags,
              retries,
              savedResponse(response),
            ];
            const fits = afford(() => jsonSize(answered) - jsonSize(bare));
            return [qid, fits ? answered : bare];
          }),
        );
      }
      if (unit.responses?.size) {
        const r = Object.fromEntries(
          [...unit.responses].map(([qid, response]) => [
            qid,
            savedResponse(response),
          ]),
        );
        if (afford(() => jsonSize({ ...entry, r }) - jsonSize(entry)))
          entry.r = r;
      }
      const unanswered = this.#unlistedUnanswered(pageIndex);
      if (unanswered.length > 0) entry.w = unanswered;
      if (Object.keys(entry).length > 0) g[pageIndex] = entry;
    }
    return {
      v: [...this.visitedPages],
      ...(Object.keys(g).length > 0 ? { g } : {}),
      ...(this.chunkProgress.size > 0
        ? { c: Object.fromEntries(this.chunkProgress) }
        : {}),
      ...(this.#manuallyCompleted ? { m: 1 } : {}),
      ...(this.#gradedScoreDecided ? { s: 1 } : {}),
      ...(this.reportedCompletionStatus === 'complete' ? { k: 1 } : {}),
      ...(this.#passScore !== null ? { p: this.#passScore } : {}),
    };
  }

  /**
   * Apply saved progress without latching partway, then restore the saved
   * latches. A saved pass the course can no longer give is dropped.
   */
  restoreFrom(saved: Partial<Record<keyof SavedProgress, unknown>>): void {
    const pageEntries = (record: unknown) =>
      Object.entries(isRecord(record) ? record : {}).flatMap(([key, value]) => {
        const pageIndex = Number(key);
        return String(pageIndex) === key &&
          isPageIndex(pageIndex, this.#totalPages)
          ? [[pageIndex, value] as const]
          : [];
      });
    this.#replaying = true;
    try {
      for (const idx of Array.isArray(saved.v) ? saved.v : []) {
        this.markVisited(idx);
      }
      for (const [pageIndex, chunkIndex] of pageEntries(saved.c)) {
        if (typeof chunkIndex === 'number') {
          this.markChunk(pageIndex, chunkIndex);
        }
      }
      for (const [pageIndex, unit] of pageEntries(saved.g)) {
        if (!isRecord(unit)) continue;
        if (typeof unit.s === 'number') {
          this.#write(pageIndex, {
            quizScore: clampScore(unit.s),
            attempts:
              typeof unit.a === 'number' && Number.isFinite(unit.a)
                ? Math.max(1, Math.ceil(unit.a))
                : 1,
            responses: encodeResponses(
              Object.entries(isRecord(unit.r) ? unit.r : {}).map(
                ([qid, response]) => [qid, swapIds(response)],
              ),
            ),
          });
        }
        const unanswered = (Array.isArray(unit.w) ? unit.w : []).filter(
          (id): id is string => typeof id === 'string',
        );
        if (unanswered.length > 0) {
          this.#unconfirmed.set(pageIndex, new Set(unanswered));
          if (this.#expect(pageIndex, unanswered, true)) this.#changed();
        }
        for (const [qid, entry] of Object.entries(
          isRecord(unit.q) ? unit.q : {},
        )) {
          const [score, weight, flags, retries, response] = Array.isArray(entry)
            ? entry
            : [entry, 1, 1];
          if (typeof score !== 'number') continue;
          // Flags 1, 2, 4 and 8, never 2 with 4.
          const bits =
            Number.isInteger(flags) &&
            flags >= 0 &&
            flags < 16 &&
            (flags & 6) !== 6
              ? flags
              : 0;
          this.markStandaloneQuestion(
            pageIndex,
            qid,
            score,
            !!(bits & 1),
            weight,
            {
              retries,
              response: swapIds(response),
              correct: bits & 2 ? null : score >= 100 !== !!(bits & 4),
              final: !!(bits & 8),
            },
          );
        }
      }
      if (saved.m === 1) this.markCompleteManually();
    } finally {
      this.#replaying = false;
    }
    this.#gradedScoreDecided = saved.s === 1;
    this.#completionReached = saved.k === 1;
    const canPass =
      this.#success.from === 'quiz' ||
      (this.#success.from === 'fixed' && this.#success.status === 'passed');
    this.#passScore =
      canPass && typeof saved.p === 'number' ? clampScore(saved.p) : null;
    this.#latch();
  }

  #changed() {
    this.version++;
    if (!this.#replaying) this.#latch();
  }

  #latch() {
    untrack(() => {
      this.#gradedScoreDecided ||= this.gradedScoreFinal;
      this.#completionReached ||= this.completionStatus === 'complete';
      const { average } = this.#graded;
      if (this.#passScore !== null || this.#verdict === 'passed')
        this.#passScore = Math.max(this.#passScore ?? average, average);
    });
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
    if (this.#requiredGradedIndices.size === 0) return 'incomplete';
    return this.#graded.average >= this.#config.scoring.passingScore
      ? 'complete'
      : 'incomplete';
  });

  reportedCompletionStatus = $derived<CompletionStatus>(
    this.#completionReached ? 'complete' : this.completionStatus,
  );

  /** Completion is reached or out of reach: quiz completion takes a score that a final one can no longer become. */
  get attemptOver(): boolean {
    return (
      this.reportedCompletionStatus === 'complete' ||
      (this.#config.completion.mode === 'quiz' && this.verdictFinal)
    );
  }

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
      this.#answeredScore(pageIndex) === undefined
    );
  }

  #verdict = $derived.by<SuccessStatus>(() => {
    const success = this.#success;
    if (success.from === 'none') return 'unknown';
    if (success.from === 'fixed')
      return this.reportedCompletionStatus === 'complete'
        ? success.status
        : 'unknown';
    if (!this.gradedScoreFinal) return 'unknown';
    if (this.#graded.average < this.#config.scoring.passingScore)
      return 'failed';
    return this.reportedCompletionStatus === 'complete' ? 'passed' : 'unknown';
  });

  successStatus = $derived<SuccessStatus>(
    this.#passScore !== null ? 'passed' : this.#verdict,
  );

  get reportedScore(): number {
    return this.#passScore ?? this.#graded.average;
  }

  /**
   * Live course average that successStatus judges: every required graded page,
   * plus the optional ones answered. The LMS gets reportedScore, which keeps
   * the best score from a pass on.
   */
  get gradedScore(): { average: number; attempted: boolean } {
    const { average, attempted } = this.#graded;
    return { average, attempted };
  }
}
