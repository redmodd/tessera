import { getContext, setContext, onDestroy, onMount, tick } from 'svelte';
import type { Interaction } from './interaction.js';
import { isCorrect as isCorrectInteraction } from './interaction.js';
import {
  requireNavContext,
  getNavContext,
  getAdapterContext,
  getPageContext,
  requireUserStateStore,
} from './contexts.js';
import { QuizEngine } from './quiz-engine.svelte.js';

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
  /** True/false once submitted; null while answering, and null on a restored result (answers aren't persisted). */
  readonly correct: boolean | null;
  /** Current learner answer, or undefined if not yet answered. */
  readonly answer: unknown;
  /** Whether the answer is whole enough to submit (5 of 5 pairs matched). */
  readonly answerComplete: boolean;
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
  /** Whether the current answer is fully specified. Default: true. */
  complete?: () => boolean;
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

export interface QuestionInternal extends Question {
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
      complete: opts.complete,
      interaction: () => opts.response(),
    });
    const handle = q as UseQuestionHandle;
    handle.submit = () => {};
    handle.reset = () => opts.reset?.();
    handle.retry = () => {};
    Object.defineProperties(handle, {
      canRetry: { value: false },
      retryCount: { value: 0 },
      mode: { value: 'quiz' },
    });
    return handle;
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
      isCorrectInteraction(response),
    );
  }

  function submit() {
    if (submitted) return;
    const response = opts.response();
    currentAnswer = response.response;
    correct = isCorrectInteraction(response);
    const score = opts.score ? opts.score() : correct === true ? 100 : 0;

    if (!committed) {
      adapterCtx?.adapter.reportInteraction(opts.id, response, correct);
      committed = true;
    }
    if (navCtx) {
      const pageIndex = navCtx.nav.currentPageIndex;
      navCtx.progress.markStandaloneQuestion(
        pageIndex,
        opts.id,
        score,
        !!opts.graded,
      );
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
    get id() {
      return opts.id;
    },
    get submitted() {
      return submitted;
    },
    get correct() {
      return correct;
    },
    get answer() {
      return currentAnswer;
    },
    get answerComplete() {
      return currentAnswer !== undefined && (opts.complete?.() ?? true);
    },
    get feedbackVisible() {
      return submitted;
    },
    get locked() {
      return submitted;
    },
    get isLockedCorrect() {
      return submitted && correct === true && retryCount >= maxRetries;
    },
    render: undefined,
    setAnswer(a: unknown) {
      currentAnswer = a;
    },
    commit,
    submit,
    reset,
    retry,
    get canRetry() {
      return retryCount < maxRetries;
    },
    get retryCount() {
      return retryCount;
    },
    mode: 'standalone' as const,
    setRender() {},
  };
}

export function useNavigation() {
  const { nav, manifest } = requireNavContext('useNavigation()');
  return {
    get currentPage() {
      return manifest.pages[nav.currentPageIndex];
    },
    get currentPageIndex() {
      return nav.currentPageIndex;
    },
    get pages() {
      return manifest.pages;
    },
    goTo(slug: string) {
      const index = manifest.pages.findIndex((p) => p.slug === slug);
      if (index >= 0) nav.goToPage(index);
    },
    goToIndex(index: number) {
      nav.goToPage(index);
    },
    next() {
      nav.goNext();
    },
    prev() {
      nav.goPrev();
    },
    get canGoNext() {
      return nav.canGoNext;
    },
    get canGoPrev() {
      return nav.canGoPrev;
    },
    canAccess(slug: string) {
      const index = manifest.pages.findIndex((p) => p.slug === slug);
      return index >= 0 && !nav.isPageLocked(index);
    },
  };
}

export function useProgress() {
  const { progress } = requireNavContext('useProgress()');
  return {
    get visitedPages() {
      return progress.visitedPages;
    },
    get quizScores() {
      return progress.quizScores;
    },
    get chunkProgress() {
      return progress.chunkProgress;
    },
    get completionStatus() {
      return progress.completionStatus;
    },
    get successStatus() {
      return progress.successStatus;
    },
    markVisited(pageIndex: number) {
      progress.markVisited(pageIndex);
    },
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
  const { progress, config } = requireNavContext('useCompletion()');
  return {
    markComplete() {
      if (config.completion.mode !== 'manual') {
        if (import.meta.env?.DEV && !warnedNonManualCompletion) {
          warnedNonManualCompletion = true;
          console.warn(
            "Tessera: useCompletion().markComplete() ignored — completion.mode is not 'manual'. " +
              '(This warning is shown once per session.)',
          );
        }
        return;
      }
      progress.markCompleteManually();
    },
    get completionStatus() {
      return progress.completionStatus;
    },
  };
}

export function usePersistence<T = unknown>(
  key: string,
): {
  get(): T | null;
  set(value: T): void;
} {
  const store = requireUserStateStore('usePersistence()');
  return {
    get(): T | null {
      return (store.get(key) as T | null) ?? null;
    },
    set(value: T) {
      store.set(key, value);
    },
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
  complete?: () => boolean;
  /** Returns the current Interaction payload for LMS reporting. */
  interaction?: () => Interaction;
}

export interface UseQuizHandle {
  readonly state: 'answering' | 'submitted' | 'reviewing';
  readonly questions: ReadonlyArray<Question>;
  readonly canSubmit: boolean;
  readonly canRetry: boolean;
  /** Score for the attempt just submitted, or the restored result. */
  readonly score: number;
  /**
   * Highest score across attempts. This is what the LMS is given, so show it
   * whenever it exceeds `score`.
   */
  readonly bestScore: number;
  /** Resolved passing threshold (config + LMS mastery override). */
  readonly passingScore: number;
  readonly attemptCount: number;
  /**
   * True while the results shown came from saved progress rather than this
   * mount. Answers aren't persisted, so per-question results and review are
   * unavailable until the learner retries.
   */
  readonly restored: boolean;
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
      'Did your custom quiz shell forget to call handle.submit()?',
  );
}

export function __warnEmptyQuiz(questionsCount: number): void {
  if (questionsCount > 0) return;
  console.warn(
    '[tessera] useQuiz: quiz mounted with no registered questions. Question widgets ' +
      'must call useQuestion() to be scored and reported to the LMS.',
  );
}

export function useQuiz(opts: {
  element: () => HTMLElement | null;
}): UseQuizHandle {
  const pageCtx = getPageContext();
  const adapterCtx = getAdapterContext();
  if (!pageCtx?.quiz) {
    throw new Error(
      'useQuiz() must be called on a page with a quiz config (export const pageConfig = { quiz: { ... } }).',
    );
  }

  // A second useQuiz on the same page silently overwrites the first quiz's
  // pageIndex-keyed score; warn but don't prevent (some pages compose hosts).
  const existing = getContext<unknown>(TESSERA_QUIZ);
  if (existing) {
    console.warn(
      '[tessera] useQuiz: a second quiz registered on this page; ' +
        'quiz scores are keyed by pageIndex and the later submit will overwrite the earlier one.',
    );
  }

  const engine = new QuizEngine({
    quizConfig: pageCtx.quiz,
    passingScore: () => pageCtx.passingScore,
    report: (id, interaction, correct) =>
      adapterCtx?.adapter.reportInteraction(id, interaction, correct),
    dispatch: (name, detail) => {
      const el = opts.element();
      if (!el) return false;
      el.dispatchEvent(new CustomEvent(name, { detail, bubbles: true }));
      return true;
    },
    restore: pageCtx.quizState ?? undefined,
  });

  setContext<QuizContextValue>(TESSERA_QUIZ, {
    registerQuestion: (api) => engine.registerQuestion(api),
  });

  onMount(() => {
    if (!import.meta.env?.DEV) return;
    void tick().then(() => __warnEmptyQuiz(engine.questions.length));
  });

  onDestroy(() => {
    __warnUnsubmittedQuiz(engine.stats);
  });

  return engine;
}
