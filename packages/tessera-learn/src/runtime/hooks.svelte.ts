import { getContext, setContext, onDestroy, onMount, tick } from 'svelte';
import { SvelteSet } from 'svelte/reactivity';
import type { Interaction } from './interaction.js';
import { isCorrect as isCorrectInteraction } from './interaction.js';
import {
  requireNavContext,
  getNavContext,
  getAdapterContext,
  getPageContext,
  requireUserStateStore,
} from './contexts.js';
import {
  resolveFeedbackMode,
  resolveRetryStrategy,
  type QuizPolicyConfig,
  type QuizQuestionResult,
} from './quiz-policy.js';

/**
 * Per-question handle exposed to both the quiz shell (via `useQuiz().questions`)
 * and the question widget (via `useQuestion()`). All state and operations for
 * one question live on this object — no index plumbing.
 */
export interface Question {
  /** Stable id used as the LMS interaction key. */
  readonly id: string;
  /** True once the quiz containing this question has been submitted. */
  readonly submitted: boolean;
  /** True/false once submitted; null while answering. */
  readonly correct: boolean | null;
  /** Current learner answer, or undefined if not yet answered. */
  readonly answer: unknown;
  /** Whether feedback should currently render for this question. */
  readonly feedbackVisible: boolean;
  /**
   * True when the widget must treat its input as read-only — either because
   * the quiz has been submitted, feedback is showing, or the answer is locked
   * by a retry policy. Widgets should branch on this alone; the engine owns
   * the composition.
   */
  readonly locked: boolean;
  /**
   * Narrow case of `locked`: the answer is preserved as "already correct" by
   * a retry policy (e.g. `retryMode: 'incorrect-only'`). Use this to show an
   * explicit banner; use `locked` to gate input.
   */
  readonly isLockedCorrect: boolean;
  /** Snippet the widget registered with `setRender` (shell calls `{@render q.render()}`). */
  readonly render: unknown;
  /** Record the learner's current answer. Called from the widget on user input. */
  setAnswer(answer: unknown): void;
  /** Signal the answer is final; triggers the per-question LMS write. */
  commit(): void;
}

export interface UseQuestionOptions {
  /** Stable identifier used for LMS interaction reporting. Must be unique on the page. */
  id: string;
  /** Whether this question counts toward course success status. Default false. */
  graded?: boolean;
  /**
   * Optional weight for quiz scoring — used inside a quiz host that aggregates
   * with the weighted formula `Σ(w·correct)/Σ(w)·100`. Default 1; ignored in
   * standalone mode.
   */
  weight?: number;
  /** Standalone retry cap. Default `Infinity`. Ignored inside a quiz. */
  maxRetries?: number;
  /** Called on submit — returns the current learner response payload. */
  response: () => Interaction;
  /**
   * Optional score override (0–100). Standalone mode only — per-question
   * scoring inside a quiz is the quiz's responsibility.
   */
  score?: () => number;
  /** Optional reset handler invoked when the learner tries again. */
  reset?: () => void;
}

/**
 * Question handle plus standalone-only operations. Inside a quiz, the
 * standalone-only methods are no-ops (the quiz shell drives submission /
 * retry). `mode` reflects which environment the widget mounted into.
 */
export interface UseQuestionHandle extends Question {
  /** Standalone submit. No-op inside a quiz (the shell drives submission). */
  submit(): void;
  /** Reset the widget's own state. */
  reset(): void;
  /** Standalone retry. No-op once `maxRetries` is hit or inside a quiz. */
  retry(): void;
  readonly canRetry: boolean;
  readonly retryCount: number;
  readonly mode: 'standalone' | 'quiz';
  /**
   * Register a Svelte snippet for the quiz shell to render at its chosen
   * location. Standalone widgets don't need this — they render their own UI.
   */
  setRender(render: unknown): void;
}

const TESSERA_QUIZ = 'tessera-quiz' as const;

interface QuestionInternal extends Question {
  setRender(render: unknown): void;
}

interface QuizContextValue {
  registerQuestion(api: UseQuizQuestionApi): QuestionInternal;
}

/**
 * Register a question widget with the Tessera runtime. Works outside a quiz
 * for inline practice, and inside a quiz host — the same hook drives both
 * modes. Inside a quiz, `submit()` is a no-op (the parent quiz drives
 * submission) and `submitted`/`correct` mirror the quiz's state.
 */
export function useQuestion(opts: UseQuestionOptions): UseQuestionHandle {
  const quizCtx = getContext<QuizContextValue | undefined>(TESSERA_QUIZ);
  const navCtx = getNavContext();
  const adapterCtx = getAdapterContext();

  if (quizCtx) {
    const q = quizCtx.registerQuestion({
      id: opts.id,
      weight: opts.weight,
      checkAnswer: () => isCorrectInteraction(opts.response()) === true,
      reset: opts.reset,
      interaction: () => opts.response(),
    });
    return {
      get id() { return q.id; },
      get submitted() { return q.submitted; },
      get correct() { return q.correct; },
      get answer() { return q.answer; },
      get feedbackVisible() { return q.feedbackVisible; },
      get locked() { return q.locked; },
      get isLockedCorrect() { return q.isLockedCorrect; },
      get render() { return q.render; },
      setAnswer(a: unknown) { q.setAnswer(a); },
      commit() { q.commit(); },
      submit() {},
      reset() { opts.reset?.(); },
      retry() {},
      canRetry: false,
      retryCount: 0,
      mode: 'quiz' as const,
      setRender(render: unknown) { q.setRender(render); },
    };
  }

  const maxRetries = opts.maxRetries ?? Infinity;
  let submitted = $state(false);
  let correct = $state<boolean | null>(null);
  let retryCount = $state(0);
  let currentAnswer = $state<unknown>(undefined);

  let committed = false;

  function commit() {
    const response = opts.response();
    if (!response) return;
    committed = true;
    adapterCtx?.adapter.reportInteraction(
      opts.id,
      response,
      isCorrectInteraction(response)
    );
  }

  function submit() {
    if (submitted) return;
    const response = opts.response();
    currentAnswer = response.response;
    correct = isCorrectInteraction(response);
    const score = opts.score
      ? opts.score()
      : correct === true
        ? 100
        : 0;

    if (!committed) {
      adapterCtx?.adapter.reportInteraction(opts.id, response, correct);
      committed = true;
    }
    if (opts.graded && navCtx) {
      const pageIndex = navCtx.nav.currentPageIndex;
      navCtx.progress.markStandaloneQuestion(pageIndex, opts.id, score, true);
      navCtx.progress.recalculateCompletion(navCtx.manifest.totalPages, navCtx.config);
      navCtx.progress.recalculateSuccess(navCtx.config);
    } else if (navCtx) {
      const pageIndex = navCtx.nav.currentPageIndex;
      navCtx.progress.markStandaloneQuestion(pageIndex, opts.id, score, false);
    }

    submitted = true;
  }

  function reset() {
    submitted = false;
    correct = null;
    currentAnswer = undefined;
    committed = false;
    opts.reset?.();
  }

  function retry() {
    if (retryCount >= maxRetries) return;
    retryCount++;
    reset();
  }

  return {
    get id() { return opts.id; },
    get submitted() { return submitted; },
    get correct() { return correct; },
    get answer() { return currentAnswer; },
    get feedbackVisible() { return submitted; },
    get locked() { return submitted; },
    get isLockedCorrect() { return submitted && correct === true && retryCount >= maxRetries; },
    render: undefined,
    setAnswer(a: unknown) { currentAnswer = a; },
    commit,
    submit,
    reset,
    retry,
    get canRetry() { return retryCount < maxRetries; },
    get retryCount() { return retryCount; },
    mode: 'standalone' as const,
    setRender() {},
  };
}

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

let warnedNonManualCompletion = false;

export function __resetUseCompletionWarning(): void {
  warnedNonManualCompletion = false;
}

export function useCompletion(): {
  markComplete(): void;
  readonly completionStatus: 'incomplete' | 'complete';
} {
  const { progress, manifest, config } = requireNavContext('useCompletion()');
  return {
    markComplete() {
      if (config.completion.mode !== 'manual') {
        if (import.meta.env?.DEV && !warnedNonManualCompletion) {
          warnedNonManualCompletion = true;
          console.warn(
            "Tessera: useCompletion().markComplete() ignored — completion.mode is not 'manual'. " +
              '(This warning is shown once per session.)'
          );
        }
        return;
      }
      progress.markCompleteManually();
      progress.recalculateSuccess(config);
    },
    get completionStatus() {
      return progress.completionStatus;
    },
  };
}

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

/**
 * Internal registration shape — `useQuestion` builds this and hands it to the
 * quiz's `registerQuestion`. Not part of the public authoring API.
 */
export interface UseQuizQuestionApi {
  id: string;
  /** Optional weight for the score rollup. Default 1 — `Σ(w·correct)/Σ(w)·100`. */
  weight?: number;
  checkAnswer: (answer?: unknown) => boolean;
  reset?: () => void;
  /** Returns the current Interaction payload for LMS reporting. */
  interaction?: () => Interaction;
}

export interface UseQuizHandle {
  readonly state: 'answering' | 'submitted' | 'reviewing';
  readonly questions: ReadonlyArray<Question>;
  readonly canSubmit: boolean;
  readonly canRetry: boolean;
  readonly score: number;
  /** Resolved passing threshold (config + LMS mastery override). */
  readonly passingScore: number;
  readonly attemptCount: number;
  submit(): void;
  startReview(): void;
  exitReview(): void;
  retry(): void;
  /** Reveal feedback for the given question. */
  revealFeedback(q: Question): void;
}

/**
 * Internal test/component seam. The implementation also exposes index-keyed
 * methods on the returned object so unit tests can drive the engine directly
 * and the built-in `<Quiz>` can iterate by index. NOT part of the public API
 * — authors should use `quiz.questions[].setAnswer(...)` etc.
 */
export interface UseQuizInternalHandle extends UseQuizHandle {
  registerQuestion(api: UseQuizQuestionApi): Question;
  setAnswer(index: number, answer: unknown): void;
  getAnswer(index: number): unknown;
  setRender(index: number, render: unknown): void;
  getRender(index: number): unknown;
  feedbackVisible(index: number): boolean;
  revealFeedbackByIndex(index: number): void;
  isLockedCorrect(index: number): boolean;
}

interface InternalQuestion {
  id: string;
  weight: number;
  checkAnswer: (answer?: unknown) => boolean;
  reset?: () => void;
  interaction?: () => Interaction;
  render: unknown;
}

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

export function __warnEmptyQuiz(questionsCount: number): void {
  if (questionsCount > 0) return;
  console.warn(
    '[tessera] useQuiz: quiz mounted with no registered questions. Question widgets ' +
      'must call useQuestion() to be scored and reported to the LMS.'
  );
}

export function useQuiz(opts: { element: () => HTMLElement | null }): UseQuizHandle {
  const pageCtx = getPageContext();
  const adapterCtx = getAdapterContext();
  if (!pageCtx?.quiz) {
    throw new Error(
      'useQuiz() must be called on a page with a quiz config (export const pageConfig = { quiz: { ... } }).'
    );
  }
  const quizConfig = pageCtx.quiz;

  // A second useQuiz on the same page silently overwrites the first quiz's
  // pageIndex-keyed score; warn but don't prevent (some pages compose hosts).
  const existing = getContext<unknown>(TESSERA_QUIZ);
  if (existing) {
    console.warn(
      '[tessera] useQuiz: a second quiz registered on this page; ' +
        'quiz scores are keyed by pageIndex and the later submit will overwrite the earlier one.'
    );
  }

  const maxAttempts = quizConfig.maxAttempts ?? Infinity;
  const policyCfg = quizConfig as QuizPolicyConfig;
  const feedbackPredicate = resolveFeedbackMode(policyCfg);
  const retryPredicate = resolveRetryStrategy(policyCfg);

  let internalQuestions = $state<InternalQuestion[]>([]);
  const answers = new Map<number, unknown>();
  const reportedAnswers = new Map<number, string>();
  let answersVersion = $state(0);
  let submitted = $state(false);
  let reviewing = $state(false);
  let score = $state(0);
  let attemptCount = $state(0);
  const feedbackShown = new SvelteSet<number>();
  const lockedCorrect = new SvelteSet<number>();
  let submitCalled = false;

  const seenIds = new Set<string>();

  const totalQuestions = $derived(internalQuestions.length);
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
    if (!el) return;
    el.dispatchEvent(new CustomEvent(name, { detail, bubbles: true }));
  }

  function setAnswerInternal(index: number, answer: unknown): void {
    answers.set(index, answer);
    answersVersion++;
    dispatch('tessera-quiz-question-answered', { index });
  }

  function commitInternal(index: number): void {
    if (!adapterCtx) return;
    const q = internalQuestions[index];
    if (!q || typeof q.interaction !== 'function') return;
    const interaction = q.interaction();
    if (!interaction) return;
    const fingerprint = JSON.stringify(interaction);
    if (reportedAnswers.get(index) === fingerprint) return;
    const answer = answers.has(index) ? answers.get(index) : undefined;
    adapterCtx.adapter.reportInteraction(q.id, interaction, q.checkAnswer(answer));
    reportedAnswers.set(index, fingerprint);
  }

  function getAnswerInternal(index: number): unknown {
    void answersVersion;
    return answers.get(index);
  }

  function setRenderInternal(index: number, render: unknown): void {
    if (internalQuestions[index]) internalQuestions[index].render = render;
  }

  function getRenderInternal(index: number): unknown {
    return internalQuestions[index]?.render;
  }

  function feedbackVisibleInternal(index: number): boolean {
    if (policyCfg.feedbackMode === 'never') return false;
    return feedbackPredicate({
      questionIndex: index,
      submitted,
      reviewing,
      hasAnswered: answers.has(index),
      revealed: feedbackShown.has(index),
      attemptCount,
    });
  }

  function revealFeedbackInternal(index: number): void {
    if (policyCfg.feedbackMode === 'never') return;
    feedbackShown.add(index);
  }

  function isLockedCorrectInternal(index: number): boolean {
    return lockedCorrect.has(index);
  }

  function makeQuestionHandle(i: number): QuestionInternal {
    return {
      get id() { return internalQuestions[i].id; },
      get submitted() { return submitted; },
      get correct() {
        if (!submitted) return null;
        const a = answers.has(i) ? answers.get(i) : undefined;
        return internalQuestions[i].checkAnswer(a);
      },
      get answer() { return getAnswerInternal(i); },
      get feedbackVisible() { return feedbackVisibleInternal(i); },
      get locked() {
        return submitted || feedbackVisibleInternal(i) || isLockedCorrectInternal(i);
      },
      get isLockedCorrect() { return isLockedCorrectInternal(i); },
      get render() { return getRenderInternal(i); },
      setAnswer(a: unknown) { setAnswerInternal(i, a); },
      commit() { commitInternal(i); },
      setRender(r: unknown) { setRenderInternal(i, r); },
    };
  }

  let questionHandles = $state<QuestionInternal[]>([]);

  function registerQuestion(api: UseQuizQuestionApi): QuestionInternal {
    if (seenIds.has(api.id)) {
      console.warn(
        `[tessera] useQuiz: duplicate question id "${api.id}" — ` +
          'each question id must be unique within a quiz (LMS interaction records key by id).'
      );
    }
    seenIds.add(api.id);
    const internal: InternalQuestion = {
      id: api.id,
      weight: typeof api.weight === 'number' && api.weight > 0 ? api.weight : 1,
      checkAnswer: api.checkAnswer,
      reset: api.reset,
      interaction: api.interaction,
      render: undefined,
    };
    internalQuestions.push(internal);
    const handle = makeQuestionHandle(internalQuestions.length - 1);
    questionHandles.push(handle);
    return handle;
  }

  function computeScore(): { rounded: number; correctCount: number } {
    let weighted = 0;
    let totalWeight = 0;
    let correctCount = 0;
    for (let i = 0; i < internalQuestions.length; i++) {
      const q = internalQuestions[i];
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

    for (let i = 0; i < internalQuestions.length; i++) commitInternal(i);

    const { rounded } = computeScore();
    score = rounded;
    submitted = true;
    attemptCount++;

    el.dispatchEvent(
      new CustomEvent('tessera-quiz-complete', {
        detail: { score: rounded },
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
    const results: QuizQuestionResult[] = [];
    for (let i = 0; i < internalQuestions.length; i++) {
      const a = answers.has(i) ? answers.get(i) : undefined;
      results.push({
        interaction: internalQuestions[i].interaction?.() ?? ({} as never),
        correct: internalQuestions[i].checkAnswer(a),
        weight: internalQuestions[i].weight,
      });
    }
    const newLocked = retryPredicate(results);
    const preserved = new Map<number, unknown>();
    for (const i of newLocked) {
      if (answers.has(i)) preserved.set(i, answers.get(i));
    }
    lockedCorrect.clear();
    for (const i of newLocked) lockedCorrect.add(i);
    answers.clear();
    reportedAnswers.clear();
    for (const [i, a] of preserved) answers.set(i, a);
    for (let i = 0; i < internalQuestions.length; i++) {
      if (!newLocked.has(i) && internalQuestions[i].reset) internalQuestions[i].reset!();
    }
    answersVersion++;
    feedbackShown.clear();
    submitted = false;
    reviewing = false;
    score = 0;
    dispatch('tessera-quiz-retry');
  }

  function revealFeedback(q: Question): void {
    const index = internalQuestions.findIndex((iq) => iq.id === q.id);
    if (index >= 0) revealFeedbackInternal(index);
  }

  setContext<QuizContextValue>(TESSERA_QUIZ, { registerQuestion });

  onMount(() => {
    if (!import.meta.env?.DEV) return;
    void tick().then(() => __warnEmptyQuiz(internalQuestions.length));
  });

  onDestroy(() => {
    __warnUnsubmittedQuiz({
      questionsCount: internalQuestions.length,
      answersCount: answers.size,
      submitCalled,
    });
  });

  const handle: UseQuizInternalHandle = {
    get state() { return state; },
    get questions() { return questionHandles; },
    get canSubmit() { return canSubmit; },
    get canRetry() { return canRetry; },
    get score() { return score; },
    get passingScore() { return pageCtx.passingScore; },
    get attemptCount() { return attemptCount; },
    submit,
    startReview,
    exitReview,
    retry,
    revealFeedback,
    registerQuestion,
    setAnswer: setAnswerInternal,
    getAnswer: getAnswerInternal,
    setRender: setRenderInternal,
    getRender: getRenderInternal,
    feedbackVisible: feedbackVisibleInternal,
    revealFeedbackByIndex: revealFeedbackInternal,
    isLockedCorrect: isLockedCorrectInternal,
  };
  return handle;
}
