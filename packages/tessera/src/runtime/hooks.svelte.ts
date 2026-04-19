import { getContext } from 'svelte';
import type { Interaction } from './interaction.js';
import { isCorrect as isCorrectInteraction } from './interaction.js';
import type { PersistenceAdapter } from './persistence.js';

export interface UseQuestionOptions {
  /** Stable identifier used for LMS interaction reporting. Must be unique on the page. */
  id: string;
  /** Whether this question counts toward course success status. Default false. */
  graded?: boolean;
  /** Called on submit — returns the current learner response payload. */
  response: () => Interaction;
  /**
   * Optional score override (0–100). Standalone mode only — per-question scoring
   * inside a `<Quiz>` is the quiz's responsibility (each question is worth 1 point
   * of the quiz total).
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
  readonly submitted: boolean;
  readonly correct: boolean | null;
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
  const quizCtx = getContext<any>('tessera-quiz');
  const navCtx = getContext<any>('tessera-nav');
  const adapterCtx = getContext<{ adapter: PersistenceAdapter }>('tessera-adapter');

  if (quizCtx?.registerQuestion) {
    const quizIndex = quizCtx.registerQuestion({
      id: opts.id,
      checkAnswer: () => isCorrectInteraction(opts.response()) === true,
      reset: opts.reset,
      interaction: () => opts.response(),
      render: opts.render,
    });
    return {
      submit() {},
      reset() { opts.reset?.(); },
      get submitted() { return quizCtx.submitted ?? false; },
      get correct() {
        if (!(quizCtx.submitted ?? false)) return null;
        return isCorrectInteraction(opts.response());
      },
      mode: 'quiz' as const,
      quizIndex,
    };
  }

  let submitted = $state(false);
  let correct = $state<boolean | null>(null);

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

  return {
    submit,
    reset,
    get submitted() { return submitted; },
    get correct() { return correct; },
    mode: 'standalone' as const,
    quizIndex: undefined,
  };
}

/**
 * Access Tessera navigation imperatively — programmatic go-to, next/prev,
 * and the active page.
 */
export function useNavigation() {
  const ctx = getContext<any>('tessera-nav');
  if (!ctx) {
    throw new Error('useNavigation() must be called inside a Tessera course');
  }
  const { nav, manifest } = ctx;
  return {
    get currentPage() { return manifest.pages[nav.currentPageIndex]; },
    get currentPageIndex() { return nav.currentPageIndex; },
    get pages() { return manifest.pages; },
    goTo(slug: string) {
      const index = manifest.pages.findIndex((p: any) => p.slug === slug);
      if (index >= 0) nav.goToPage(index);
    },
    goToIndex(index: number) { nav.goToPage(index); },
    next() { nav.goNext(); },
    prev() { nav.goPrev(); },
    get canGoNext() { return nav.canGoNext; },
    get canGoPrev() { return nav.canGoPrev; },
    canAccess(slug: string) {
      const index = manifest.pages.findIndex((p: any) => p.slug === slug);
      return index >= 0 && !nav.isPageLocked(index);
    },
  };
}

/**
 * Access Tessera progress state imperatively.
 */
export function useProgress() {
  const ctx = getContext<any>('tessera-nav');
  if (!ctx) {
    throw new Error('useProgress() must be called inside a Tessera course');
  }
  const { progress } = ctx;
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
  const store = getContext<{
    get(key: string): unknown;
    set(key: string, value: unknown): void;
  }>('tessera-user-state');
  if (!store) {
    throw new Error('usePersistence() must be called inside a Tessera course');
  }
  return {
    get(): T | null { return (store.get(key) as T | null) ?? null; },
    set(value: T) { store.set(key, value); },
  };
}
