import { getContext, setContext, onDestroy } from 'svelte';
import type { Interaction } from './interaction.js';
import { isCorrect as isCorrectInteraction } from './interaction.js';
import {
  requireNavContext,
  getNavContext,
  getAdapterContext,
  getPageContext,
  requireUserStateStore,
} from './contexts.js';
import { buildQuizInteractions } from '../components/quiz-payload.js';
import type { QuizContext } from '../components/quiz-payload.js';
import {
  resolveFeedbackMode,
  resolveRetryStrategy,
  type QuizPolicyConfig,
  type QuizQuestionResult,
} from './quiz-policy.js';

export interface UseQuestionOptions {
  /** Stable identifier used for LMS interaction reporting. Must be unique on the page. */
  id: string;
  /** Whether this question counts toward course success status. Default false. */
  graded?: boolean;
  /**
   * Optional weight for quiz scoring — only used inside a `<Quiz>` (or `useQuiz`)
   * host that aggregates with the weighted formula `Σ(w·correct)/Σ(w)*100`.
   * Default 1; ignored in standalone mode.
   */
  weight?: number;
  /**
   * Maximum number of standalone retries permitted via `handle.retry()`.
   * Default `Infinity`. Ignored when the question is registered with a parent
   * `<Quiz>` (the quiz owns retry semantics there).
   */
  maxRetries?: number;
  /** Called on submit — returns the current learner response payload. */
  response: () => Interaction;
  /**
   * Optional score override (0–100). Standalone mode only — per-question scoring
   * inside a `<Quiz>` is the quiz's responsibility.
   */
  score?: () => number;
  /** Optional reset handler invoked when the learner tries again. */
  reset?: () => void;
  /** Optional Svelte snippet the parent `<Quiz>` renders for this question. Ignored in standalone mode. */
  render?: unknown;
}

export interface UseQuestionHandle {
  submit(): void;
  reset(): void;
  /**
   * Standalone retry — resets the question (calling `opts.reset`) and bumps
   * the retry counter. No-op when the question has hit `maxRetries` or is
   * registered with a parent Quiz (the quiz owns retry there).
   */
  retry(): void;
  readonly submitted: boolean;
  readonly correct: boolean | null;
  /** True when the standalone Try-again button should render. Always false inside a Quiz. */
  readonly canRetry: boolean;
  /** Number of times `retry()` has fired since mount. */
  readonly retryCount: number;
  readonly mode: 'standalone' | 'quiz';
  /** Index returned by the parent Quiz registration, used for per-question context reads. Undefined in standalone mode. */
  readonly quizIndex: number | undefined;
}

/**
 * Register a question widget with the Tessera runtime. Works outside a `<Quiz>`
 * for inline practice, and inside a `<Quiz>` wrapper — the same hook drives both
 * modes. Inside a Quiz the handle's `submit()` is a no-op (the parent Quiz drives
 * submission) and `submitted`/`correct` mirror the quiz's state.
 */
export function useQuestion(opts: UseQuestionOptions): UseQuestionHandle {
  const quizCtx = getContext<QuizContext | undefined>('tessera-quiz');
  const navCtx = getNavContext();
  const adapterCtx = getAdapterContext();

  if (quizCtx?.registerQuestion) {
    const quizIndex = quizCtx.registerQuestion({
      id: opts.id,
      weight: opts.weight,
      checkAnswer: () => isCorrectInteraction(opts.response()) === true,
      reset: opts.reset,
      interaction: () => opts.response(),
      render: opts.render,
    });
    return {
      submit() {},
      reset() { opts.reset?.(); },
      retry() {},
      get submitted() { return quizCtx.submitted ?? false; },
      get correct() {
        if (!(quizCtx.submitted ?? false)) return null;
        return isCorrectInteraction(opts.response());
      },
      canRetry: false,
      retryCount: 0,
      mode: 'quiz' as const,
      quizIndex,
    };
  }

  const maxRetries = opts.maxRetries ?? Infinity;
  let submitted = $state(false);
  let correct = $state<boolean | null>(null);
  let retryCount = $state(0);

  function submit() {
    if (submitted) return;
    const response = opts.response();
    correct = isCorrectInteraction(response);
    const score = opts.score
      ? opts.score()
      : correct === true
        ? 100
        : 0;

    adapterCtx?.adapter.reportInteraction(opts.id, response, correct);
    if (opts.graded && navCtx) {
      const pageIndex = navCtx.nav.currentPageIndex;
      navCtx.progress.markStandaloneQuestion(pageIndex, opts.id, score, true);
      navCtx.progress.recalculateCompletion(navCtx.manifest, navCtx.config);
      navCtx.progress.recalculateSuccess(navCtx.manifest, navCtx.config);
    } else if (navCtx) {
      const pageIndex = navCtx.nav.currentPageIndex;
      navCtx.progress.markStandaloneQuestion(pageIndex, opts.id, score, false);
    }

    submitted = true;
  }

  function reset() {
    submitted = false;
    correct = null;
    opts.reset?.();
  }

  function retry() {
    if (retryCount >= maxRetries) return;
    retryCount++;
    reset();
  }

  return {
    submit,
    reset,
    retry,
    get submitted() { return submitted; },
    get correct() { return correct; },
    get canRetry() { return retryCount < maxRetries; },
    get retryCount() { return retryCount; },
    mode: 'standalone' as const,
    quizIndex: undefined,
  };
}

/**
 * Access Tessera navigation imperatively — programmatic go-to, next/prev,
 * and the active page.
 */
export function useNavigation() {
  const { nav, manifest } = requireNavContext('useNavigation()');
  return {
    get currentPage() { return manifest.pages[nav.currentPageIndex]; },
    get currentPageIndex() { return nav.currentPageIndex; },
    get pages() { return manifest.pages; },
    goTo(slug: string) {
      const index = manifest.pages.findIndex((p) => p.slug === slug);
      if (index >= 0) nav.goToPage(index);
    },
    goToIndex(index: number) { nav.goToPage(index); },
    next() { nav.goNext(); },
    prev() { nav.goPrev(); },
    get canGoNext() { return nav.canGoNext; },
    get canGoPrev() { return nav.canGoPrev; },
    canAccess(slug: string) {
      const index = manifest.pages.findIndex((p) => p.slug === slug);
      return index >= 0 && !nav.isPageLocked(index);
    },
  };
}

/**
 * Access Tessera progress state imperatively.
 */
export function useProgress() {
  const { progress } = requireNavContext('useProgress()');
  return {
    get visitedPages() { return progress.visitedPages; },
    get quizScores() { return progress.quizScores; },
    get chunkProgress() { return progress.chunkProgress; },
    get completionStatus() { return progress.completionStatus; },
    get successStatus() { return progress.successStatus; },
    markVisited(pageIndex: number) { progress.markVisited(pageIndex); },
    markChunk(pageIndex: number, chunkIndex: number) {
      progress.markChunk(pageIndex, chunkIndex);
    },
  };
}

/**
 * Scoped persistence — save and restore per-widget state that survives reload.
 * Routes to whichever adapter the course is running under (localStorage, SCORM
 * suspend_data, or xAPI State API).
 */
export function usePersistence<T = unknown>(key: string): {
  get(): T | null;
  set(value: T): void;
} {
  const store = requireUserStateStore('usePersistence()');
  return {
    get(): T | null { return (store.get(key) as T | null) ?? null; },
    set(value: T) { store.set(key, value); },
  };
}

// ---------- useQuiz ----------

/**
 * Per-question registration shape accepted by `useQuiz().registerQuestion`.
 * Mirrors the QuizQuestionApi used by built-in `<Quiz>` plus an optional
 * `weight` for the weighted score formula.
 */
export interface UseQuizQuestionApi {
  id: string;
  /** Optional weight for the score rollup. Default 1 — `Σ(w·correct)/Σ(w)*100`. */
  weight?: number;
  checkAnswer: (answer?: unknown) => boolean;
  reset?: () => void;
  /** Optional Svelte snippet the quiz host renders for this question. */
  render?: unknown;
  /** Optional — when present, included in the `tessera-quiz-complete` event payload. */
  interaction?: () => Interaction;
}

export interface UseQuizQuestionView {
  readonly id: string;
  readonly correct: boolean | null;
  readonly submitted: boolean;
}

export interface UseQuizHandle {
  readonly state: 'answering' | 'submitted' | 'reviewing';
  readonly questions: UseQuizQuestionView[];
  readonly canSubmit: boolean;
  readonly canRetry: boolean;
  readonly score: number;
  readonly attemptCount: number;
  registerQuestion(api: UseQuizQuestionApi): number;
  setAnswer(index: number, answer: unknown): void;
  getAnswer(index: number): unknown;
  submit(): void;
  startReview(): void;
  exitReview(): void;
  retry(): void;
  revealFeedback(index: number): void;
  feedbackVisible(index: number): boolean;
  setRender(index: number, render: unknown): void;
  getRender(index: number): unknown;
  isLockedCorrect(index: number): boolean;
}

/**
 * Dev warning helper for quizzes that unmount with answered questions but no
 * submit() call. Exported so `use-quiz.test.ts` can exercise the warning code
 * path without relying on jsdom's onDestroy timing under vitest.
 */
export function __warnUnsubmittedQuiz(stats: {
  questionsCount: number;
  answersCount: number;
  submitCalled: boolean;
}): void {
  if (stats.submitCalled) return;
  if (stats.answersCount <= 0) return;
  console.warn(
    '[tessera] useQuiz: submit() was never called before unmount, but the learner answered ' +
      `${stats.answersCount} of ${stats.questionsCount} questions. ` +
      'Did your custom quiz shell forget to call handle.submit()?'
  );
}

/**
 * Programmatic quiz orchestration for custom quiz shells. Returns a handle
 * exposing the same state machine `<Quiz>` runs internally — register
 * questions, set answers, submit, review, retry — but with no template
 * baked in, so authors can build any UI on top.
 *
 * Reads quiz config from the `tessera-page` context (set by App.svelte) and
 * publishes a `tessera-quiz` context for `useQuestion` widgets to consume.
 *
 * The host element passed via `opts.element()` is what `tessera-quiz-*` DOM
 * events dispatch from. App.svelte's bridge listens on `#tessera-app` and
 * forwards `tessera-quiz-complete` into the persistence adapter.
 */
export function useQuiz(opts: { element: () => HTMLElement | null }): UseQuizHandle {
  const pageCtx = getPageContext();
  if (!pageCtx?.quiz) {
    throw new Error(
      'useQuiz() must be called on a page with a quiz config (export const pageConfig = { quiz: { ... } }).'
    );
  }
  const quizConfig = pageCtx.quiz;

  // Dev-mode warning: a second useQuiz on the same page silently overwrites
  // the first quiz's pageIndex-keyed score. We can't prevent it (some pages
  // really do compose multiple quiz hosts in dev experiments) but the
  // multi-quiz writer should know.
  const existing = getContext<unknown>('tessera-quiz');
  if (existing) {
    console.warn(
      '[tessera] useQuiz: a second quiz registered on this page; ' +
        'quiz scores are keyed by pageIndex and the later submit will overwrite the earlier one.'
    );
  }

  const maxAttempts = quizConfig.maxAttempts ?? Infinity;
  const showFeedback = quizConfig.showFeedback ?? true;

  // Desugar the feedback/retry config into predicates. The resolvers handle
  // the enum→predicate mapping plus dev-mode misuse warnings; useQuiz only
  // ever calls the predicate API beyond this point.
  const policyCfg = quizConfig as QuizPolicyConfig;
  const feedbackPredicate = resolveFeedbackMode(policyCfg);
  const retryPredicate = resolveRetryStrategy(policyCfg);
  // Whether revealing feedback for a question should lock that question's
  // answer. True for the 'immediate' enum and for any custom predicate
  // (custom predicates are opaque, so we lock conservatively rather than
  // letting a learner change a checked answer); false for the default
  // 'review' enum where feedback only appears after submit.
  const revealsLockAnswer =
    policyCfg.feedbackMode === 'immediate' ||
    typeof policyCfg.feedbackMode === 'function';

  interface InternalQuestion extends UseQuizQuestionApi {
    weight: number;
  }

  let questions = $state<InternalQuestion[]>([]);
  const answers = new Map<number, unknown>();
  let answersVersion = $state(0);
  let submitted = $state(false);
  let reviewing = $state(false);
  let score = $state(0);
  let attemptCount = $state(0);
  let feedbackShown = $state(new Set<number>());
  let lockedCorrect = $state(new Set<number>());
  let submitCalled = false;

  const seenIds = new Set<string>();

  const totalQuestions = $derived(questions.length);
  // Match the built-in <Quiz> rule: every registered question has an entry in
  // `answers`. We track the map via an explicit version counter rather than
  // a reactive Map proxy so $derived reliably re-runs across `set()` calls.
  const allAnswered = $derived(
    (void answersVersion, totalQuestions > 0 && answers.size >= totalQuestions)
  );
  const canSubmit = $derived(!submitted && allAnswered);
  const canRetry = $derived(submitted && attemptCount < maxAttempts);
  const state: 'answering' | 'submitted' | 'reviewing' = $derived(
    reviewing ? 'reviewing' : submitted ? 'submitted' : 'answering'
  );

  function dispatch(name: string, detail?: unknown): void {
    const el = opts.element();
    if (!el) {
      // Caller-side warning is the submit() path's responsibility; we stay
      // silent here so question-answered pings don't spam logs.
      return;
    }
    el.dispatchEvent(new CustomEvent(name, { detail, bubbles: true }));
  }

  function questionView(i: number): UseQuizQuestionView {
    const q = questions[i];
    return {
      get id() { return q.id; },
      get submitted() { return submitted; },
      get correct() {
        if (!submitted) return null;
        const a = answers.has(i) ? answers.get(i) : undefined;
        return q.checkAnswer(a);
      },
    };
  }

  // Stable view array — recompute when questions change.
  const questionViews = $derived(questions.map((_q, i) => questionView(i)));

  function registerQuestion(api: UseQuizQuestionApi): number {
    if (seenIds.has(api.id)) {
      console.warn(
        `[tessera] useQuiz: duplicate question id "${api.id}" — ` +
          'each question id must be unique within a quiz (LMS interaction records key by id).'
      );
    }
    seenIds.add(api.id);
    const internal: InternalQuestion = {
      ...api,
      weight: typeof api.weight === 'number' && api.weight > 0 ? api.weight : 1,
    };
    questions.push(internal);
    return questions.length - 1;
  }

  function setAnswer(index: number, answer: unknown): void {
    answers.set(index, answer);
    answersVersion++;
    dispatch('tessera-quiz-question-answered', { index });
  }

  function getAnswer(index: number): unknown {
    void answersVersion; // keep reactive readers (e.g. tests) tracking
    return answers.get(index);
  }

  function setRender(index: number, render: unknown): void {
    if (questions[index]) questions[index].render = render;
  }

  function getRender(index: number): unknown {
    return questions[index]?.render;
  }

  function feedbackVisible(index: number): boolean {
    if (!showFeedback) return false;
    return feedbackPredicate({
      questionIndex: index,
      submitted,
      reviewing,
      hasAnswered: answers.has(index),
      revealed: feedbackShown.has(index),
      attemptCount,
    });
  }

  function revealFeedback(index: number): void {
    if (!showFeedback) return;
    // Replace the Set so the $state reference changes — `.add()` on a plain
    // Set wouldn't trigger reactive readers.
    const next = new Set(feedbackShown);
    next.add(index);
    feedbackShown = next;
  }

  function isLockedCorrect(index: number): boolean {
    return lockedCorrect.has(index);
  }

  /**
   * Weighted rollup: Σ(w·correct)/Σ(w)·100, rounded.
   * Default weight 1 collapses to the unweighted mean — that path is locked
   * by the compliance test.
   */
  function computeScore(): { rounded: number; correctCount: number } {
    let weighted = 0;
    let totalWeight = 0;
    let correctCount = 0;
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      const a = answers.has(i) ? answers.get(i) : undefined;
      const ok = q.checkAnswer(a);
      totalWeight += q.weight;
      if (ok) {
        weighted += q.weight;
        correctCount++;
      }
    }
    if (totalWeight === 0) return { rounded: 0, correctCount: 0 };
    return { rounded: Math.round((weighted / totalWeight) * 100), correctCount };
  }

  function submit(): void {
    submitCalled = true;
    if (submitted) return;
    if (!allAnswered) return;
    const el = opts.element();
    if (!el) {
      console.warn(
        '[tessera] useQuiz: submit() ran but the host element was null — no LMS bridge ' +
          'listener exists, so this score will not be persisted. Make sure your custom ' +
          'quiz shell binds the element it passes to useQuiz({ element: () => ... }).'
      );
      return;
    }
    el.dispatchEvent(new CustomEvent('tessera-quiz-before-submit', { bubbles: true }));

    const { rounded } = computeScore();
    score = rounded;
    submitted = true;
    attemptCount++;

    const interactions = buildQuizInteractions(questions, answers);
    el.dispatchEvent(
      new CustomEvent('tessera-quiz-complete', {
        detail: { score: rounded, interactions },
        bubbles: true,
      })
    );
  }

  function startReview(): void {
    if (!submitted) return;
    reviewing = true;
  }

  function exitReview(): void {
    reviewing = false;
  }

  function retry(): void {
    if (!canRetry) return;
    // Build the per-question result snapshot for the retry predicate. The
    // resolver handles enum modes ('full' / 'incorrect-only') and any
    // author-supplied predicate uniformly.
    const results: QuizQuestionResult[] = [];
    for (let i = 0; i < questions.length; i++) {
      const a = answers.has(i) ? answers.get(i) : undefined;
      results.push({
        interaction: questions[i].interaction?.() ?? ({} as never),
        correct: questions[i].checkAnswer(a),
        weight: questions[i].weight,
      });
    }
    const newLocked = retryPredicate(results);
    const preserved = new Map<number, unknown>();
    for (const i of newLocked) {
      if (answers.has(i)) preserved.set(i, answers.get(i));
    }
    lockedCorrect = newLocked;
    answers.clear();
    for (const [i, a] of preserved) answers.set(i, a);
    for (let i = 0; i < questions.length; i++) {
      if (!newLocked.has(i) && questions[i].reset) questions[i].reset!();
    }
    answersVersion++;
    feedbackShown = new Set();
    submitted = false;
    reviewing = false;
    score = 0;
    dispatch('tessera-quiz-retry');
  }

  // Publish the same `tessera-quiz` context the built-in <Quiz> sets, so
  // existing useQuestion widgets work inside a custom quiz shell without
  // changes.
  setContext('tessera-quiz', {
    get registerQuestion() { return registerQuestion; },
    get setRender() { return setRender; },
    get setAnswer() { return setAnswer; },
    get getAnswer() { return getAnswer; },
    get submitted() { return submitted; },
    get reviewing() { return reviewing; },
    get showFeedback() { return showFeedback; },
    get feedbackVisible() { return feedbackVisible; },
    get isAnswerLocked() {
      return (i: number) =>
        submitted ||
        lockedCorrect.has(i) ||
        (revealsLockAnswer && feedbackShown.has(i));
    },
    get isLockedCorrect() { return (i: number) => lockedCorrect.has(i); },
  });

  onDestroy(() => {
    __warnUnsubmittedQuiz({
      questionsCount: questions.length,
      answersCount: answers.size,
      submitCalled,
    });
  });

  return {
    get state() { return state; },
    get questions() { return questionViews; },
    get canSubmit() { return canSubmit; },
    get canRetry() { return canRetry; },
    get score() { return score; },
    get attemptCount() { return attemptCount; },
    registerQuestion,
    setAnswer,
    getAnswer,
    submit,
    startReview,
    exitReview,
    retry,
    revealFeedback,
    feedbackVisible,
    setRender,
    getRender,
    isLockedCorrect,
  };
}
