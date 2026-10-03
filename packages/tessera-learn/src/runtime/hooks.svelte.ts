import { onDestroy, onMount, tick } from 'svelte';
import { isCorrect, type Interaction } from './interaction.js';
import type { QuizConfig } from './types.js';
import type { CompletionStatus } from './persistence.js';
import {
  requireNavContext,
  getNavContext,
  getAdapterContext,
  getPageContext,
  isInPage,
  optionalContext,
  requireUserStateStore,
} from './contexts.js';
import { QuizEngine } from './quiz-engine.svelte.js';
import { StandaloneQuestion } from './standalone-question.svelte.js';
import { resolveAsset } from '../components/util.js';

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
  /** True/false once submitted or once feedback is visible; null while answering, and null on a restored result (answers aren't persisted). */
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
  /** Whether this question counts toward its page score. Default false. */
  graded?: boolean;
  /**
   * How much this question pulls on the page score, in a quiz host and
   * standalone alike: `Σ(w·score)/Σ(w)`. Default 1; a non-positive or
   * non-finite weight rolls up as 1.
   */
  weight?: number;
  /** Standalone retry cap. Default `Infinity`. Ignored inside a quiz. */
  maxRetries?: number;
  /** Called on submit. Returns the current learner response, or undefined while unanswered. */
  response: () => Interaction | undefined;
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
  /** Clear the answer. After a standalone submit, same as `retry()`. */
  reset(): void;
  /** Standalone retry. No-op once correct, once `maxRetries` is hit, or inside a quiz. */
  retry(): void;
  /** Standalone: false once correct or `maxRetries` is hit. */
  readonly canRetry: boolean;
  readonly retryCount: number;
  readonly mode: 'standalone' | 'quiz';
  /**
   * Register a Svelte snippet for the quiz shell to render at its chosen
   * location. Standalone widgets don't need this — they render their own UI.
   */
  setRender(render: unknown): void;
}

interface QuizContext {
  registerQuestion(api: UseQuizQuestionApi): UseQuestionHandle;
}

const [getQuizContext, setQuizContext] = optionalContext<QuizContext>();
export { setQuizContext };

/**
 * Register a question widget with the Tessera runtime. Works outside a quiz
 * for inline practice, and inside a quiz host — the same hook drives both
 * modes. Inside a quiz, `submit()` is a no-op (the parent quiz drives
 * submission) and `submitted`/`correct` mirror the quiz's state.
 */
export function useQuestion(opts: UseQuestionOptions): UseQuestionHandle {
  const quizCtx = getQuizContext();
  const navCtx = getNavContext();
  const adapterCtx = getAdapterContext();

  if (quizCtx) {
    if (import.meta.env?.DEV) {
      const ignored = (['graded', 'score', 'maxRetries'] as const).filter(
        (k) => opts[k] !== undefined,
      );
      if (ignored.length > 0) {
        console.warn(
          `[tessera] useQuestion("${opts.id}"): ${ignored.join(', ')} ignored ` +
            'inside a quiz — the quiz owns grading, scoring and retries.',
        );
      }
    }
    return quizCtx.registerQuestion({
      id: opts.id,
      weight: opts.weight,
      checkAnswer: () => {
        const response = opts.response();
        return !!response && isCorrect(response) === true;
      },
      reset: opts.reset,
      complete: opts.complete,
      interaction: opts.response,
    });
  }

  const pageIndex = isInPage() ? getPageContext()?.index : undefined;
  let markScore: (score: number) => void = () => {};
  if (navCtx && pageIndex !== undefined) {
    if (opts.graded) {
      navCtx.progress.assertDeclaredGraded(
        pageIndex,
        navCtx.manifest.pages[pageIndex].slug,
      );
    }
    navCtx.progress.registerStandaloneQuestion(
      pageIndex,
      opts.id,
      !!opts.graded,
      opts.weight,
    );
    markScore = (score) =>
      navCtx.progress.markStandaloneQuestion(
        pageIndex,
        opts.id,
        score,
        !!opts.graded,
        opts.weight,
      );
  }

  return new StandaloneQuestion(opts, {
    report: (...args) => adapterCtx?.adapter.reportInteraction(...args),
    markScore,
  });
}

export function useNavigation() {
  const { nav, manifest } = requireNavContext('useNavigation()');
  const indexOf = (slug: string) =>
    manifest.pages.findIndex((p) => p.slug === slug);
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
      nav.goToPage(indexOf(slug));
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
      return nav.canAccessIndex(indexOf(slug));
    },
    canAccessIndex(index: number) {
      return nav.canAccessIndex(index);
    },
    get sections() {
      return manifest.sections;
    },
    prefetch(index: number) {
      nav.prefetch(index);
    },
  };
}

export function useProgress() {
  const { progress } = requireNavContext('useProgress()');
  const pageCtx = getPageContext();
  return {
    get visitedPages() {
      return progress.visitedPages;
    },
    get completedPages() {
      return progress.completedPages;
    },
    quizScore(pageIndex: number) {
      return progress.quizScore(pageIndex);
    },
    pageScore(pageIndex = pageCtx?.index) {
      return pageIndex === undefined
        ? undefined
        : progress.pageScore(pageIndex);
    },
    get gradedScore() {
      return progress.gradedScore;
    },
    get passingScore() {
      return progress.passingScore;
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

export function useCompletion(): {
  markComplete(): void;
  readonly completionStatus: CompletionStatus;
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

export function useCourse(): {
  readonly title: string;
  readonly logo: string | undefined;
  readonly canExit: boolean;
  exit(): Promise<void>;
} {
  const ctx = requireNavContext('useCourse()');
  return {
    get title() {
      return ctx.config.title;
    },
    get logo() {
      return resolveAsset(ctx.config.branding?.logo ?? '') || undefined;
    },
    get canExit() {
      return ctx.canExit;
    },
    exit: ctx.exit,
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
  checkAnswer: () => boolean;
  reset?: () => void;
  complete?: () => boolean;
  /** Returns the current Interaction payload for LMS reporting. */
  interaction?: () => Interaction | undefined;
}

export interface UseQuizHandle {
  readonly state: 'answering' | 'submitted' | 'reviewing';
  readonly questions: ReadonlyArray<Question>;
  readonly canSubmit: boolean;
  readonly canRetry: boolean;
  /** 0–100, to 2 decimal places: the attempt just submitted, or the restored result. */
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
  /** `pageConfig.quiz.feedbackMode`, defaulting to `'review'`. */
  readonly feedbackMode: NonNullable<QuizConfig['feedbackMode']>;
  /** `pageConfig.quiz.maxAttempts`, defaulting to `Infinity`. */
  readonly maxAttempts: number;
  submit(): void;
  startReview(): void;
  exitReview(): void;
  retry(): void;
  /** Reveal feedback for the given question. */
  revealFeedback(q: Question): void;
}

function warnUnsubmittedQuiz(stats: {
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

function warnEmptyQuiz(questionsCount: number): void {
  if (questionsCount > 0) return;
  console.warn(
    '[tessera] useQuiz: quiz mounted with no registered questions. Question widgets ' +
      'must call useQuestion() to be scored and reported to the LMS, and a custom ' +
      'shell must render its `children` for them to mount at all.',
  );
}

export function useQuiz(
  opts: { element?: () => HTMLElement | null } = {},
): UseQuizHandle {
  const pageCtx = getPageContext();
  const adapterCtx = getAdapterContext();
  const { progress } = requireNavContext('useQuiz()');
  if (!pageCtx?.quiz || pageCtx.index === undefined) {
    throw new Error(
      'useQuiz() must be called on a page with a quiz config (export const pageConfig = { quiz: { ... } }).',
    );
  }
  const pageIndex = pageCtx.index;

  // A second useQuiz on the same page silently overwrites the first quiz's
  // pageIndex-keyed score; warn but don't prevent (some pages compose hosts).
  if (getQuizContext()) {
    console.warn(
      '[tessera] useQuiz: a second quiz registered on this page; ' +
        'quiz scores are keyed by pageIndex and the later submit will overwrite the earlier one.',
    );
  }

  const engine = new QuizEngine({
    quizConfig: pageCtx.quiz,
    passingScore: () => pageCtx.passingScore,
    report: (...args) => adapterCtx?.adapter.reportInteraction(...args),
    onComplete: (score) => progress.quizCompleted(pageIndex, score),
    notify: (name, detail) => {
      opts
        .element?.()
        ?.dispatchEvent(new CustomEvent(name, { detail, bubbles: true }));
    },
    restore: pageCtx.quizState ?? undefined,
  });

  setQuizContext({
    registerQuestion: (api) => engine.registerQuestion(api),
  });

  onMount(() => {
    if (!import.meta.env?.DEV) return;
    void tick().then(() => warnEmptyQuiz(engine.questions.length));
  });

  onDestroy(() => {
    warnUnsubmittedQuiz(engine.stats);
  });

  return engine;
}
