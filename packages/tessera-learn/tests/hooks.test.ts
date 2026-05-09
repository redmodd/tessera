import { describe, it, expect, beforeEach, vi } from 'vitest';

// ---- getContext mock ----
// The hooks read context via Svelte's `getContext`. Tests provide a per-test
// context map, then the mock looks up the name in that map.
const ctxStore = new Map<string, unknown>();

vi.mock('svelte', async () => {
  const actual = await vi.importActual<typeof import('svelte')>('svelte');
  return {
    ...actual,
    getContext: (name: string) => ctxStore.get(name),
  };
});

import {
  useQuestion,
  useNavigation,
  useProgress,
  usePersistence,
} from '../src/runtime/hooks.svelte.js';
import type { Interaction } from '../src/runtime/interaction.js';
import { ProgressState } from '../src/runtime/progress.svelte.js';
import { NavigationState } from '../src/runtime/navigation.svelte.js';
import { createManifest, createConfig } from './helpers.js';

function makeAdapter() {
  return {
    init: vi.fn(),
    getState: vi.fn(),
    saveState: vi.fn(),
    setScore: vi.fn(),
    setCompletionStatus: vi.fn(),
    setSuccessStatus: vi.fn(),
    setDuration: vi.fn(),
    reportInteraction: vi.fn(),
    commit: vi.fn(),
    terminate: vi.fn(),
  };
}

function makeNavCtx(progress: ProgressState, currentIndex = 0) {
  const manifest = createManifest(5);
  const config = createConfig();
  const nav: any = {
    currentPageIndex: currentIndex,
    canGoNext: true,
    canGoPrev: false,
    goToPage: vi.fn((i: number) => { nav.currentPageIndex = i; }),
    goNext: vi.fn(),
    goPrev: vi.fn(),
    isPageLocked: vi.fn(() => false),
  };
  return { nav, manifest, progress, config };
}

beforeEach(() => {
  ctxStore.clear();
});

// ============ useQuestion (standalone) ============

describe('useQuestion — standalone mode', () => {
  it('reports the interaction through the adapter on submit', () => {
    const progress = new ProgressState();
    const adapter = makeAdapter();
    ctxStore.set('tessera-nav', makeNavCtx(progress));
    ctxStore.set('tessera-adapter', { adapter });

    const interaction: Interaction = {
      type: 'choice',
      response: ['a'],
      correct: ['a'],
    };
    const q = useQuestion({ id: 'q1', response: () => interaction });
    q.submit();

    expect(adapter.reportInteraction).toHaveBeenCalledWith('q1', interaction, true);
    expect(q.submitted).toBe(true);
    expect(q.correct).toBe(true);
  });

  it('flags incorrect when response does not match', () => {
    const progress = new ProgressState();
    const adapter = makeAdapter();
    ctxStore.set('tessera-nav', makeNavCtx(progress));
    ctxStore.set('tessera-adapter', { adapter });

    const q = useQuestion({
      id: 'q1',
      response: () => ({ type: 'true-false', response: false, correct: true }),
    });
    q.submit();

    expect(adapter.reportInteraction).toHaveBeenCalledWith(
      'q1',
      expect.objectContaining({ type: 'true-false' }),
      false
    );
    expect(q.correct).toBe(false);
  });

  it('does not register a graded score when graded is false', () => {
    const progress = new ProgressState();
    const adapter = makeAdapter();
    ctxStore.set('tessera-nav', makeNavCtx(progress, 2));
    ctxStore.set('tessera-adapter', { adapter });

    const q = useQuestion({
      id: 'q1',
      response: () => ({ type: 'true-false', response: true, correct: true }),
    });
    q.submit();

    // Score is recorded for the page (so authors can render it),
    // but the page is NOT in gradedStandalonePages
    expect(progress.standaloneQuestionScores.get(2)?.get('q1')).toBe(100);
    expect(progress.gradedStandalonePages.has(2)).toBe(false);
  });

  it('registers a graded score when graded is true', () => {
    const progress = new ProgressState();
    const adapter = makeAdapter();
    const ctx = makeNavCtx(progress, 3);
    ctxStore.set('tessera-nav', ctx);
    ctxStore.set('tessera-adapter', { adapter });

    const q = useQuestion({
      id: 'q1',
      graded: true,
      response: () => ({ type: 'true-false', response: true, correct: true }),
    });
    q.submit();

    expect(progress.standaloneQuestionScores.get(3)?.get('q1')).toBe(100);
    expect(progress.gradedStandalonePages.has(3)).toBe(true);
    // Graded path also recalculates
    expect(progress.successStatus).toBe('passed');
  });

  it('uses score override when provided', () => {
    const progress = new ProgressState();
    const adapter = makeAdapter();
    ctxStore.set('tessera-nav', makeNavCtx(progress, 0));
    ctxStore.set('tessera-adapter', { adapter });

    const q = useQuestion({
      id: 'q1',
      graded: true,
      response: () => ({ type: 'true-false', response: false, correct: true }),
      score: () => 42,
    });
    q.submit();

    expect(progress.standaloneQuestionScores.get(0)?.get('q1')).toBe(42);
  });

  it('submit is idempotent — calling twice does not double-report', () => {
    const progress = new ProgressState();
    const adapter = makeAdapter();
    ctxStore.set('tessera-nav', makeNavCtx(progress));
    ctxStore.set('tessera-adapter', { adapter });

    const q = useQuestion({
      id: 'q1',
      response: () => ({ type: 'true-false', response: true, correct: true }),
    });
    q.submit();
    q.submit();
    expect(adapter.reportInteraction).toHaveBeenCalledTimes(1);
  });

  it('reset clears submitted/correct and re-enables submit', () => {
    const progress = new ProgressState();
    const adapter = makeAdapter();
    const userReset = vi.fn();
    ctxStore.set('tessera-nav', makeNavCtx(progress));
    ctxStore.set('tessera-adapter', { adapter });

    const q = useQuestion({
      id: 'q1',
      response: () => ({ type: 'true-false', response: true, correct: true }),
      reset: userReset,
    });
    q.submit();
    expect(q.submitted).toBe(true);
    q.reset();

    expect(q.submitted).toBe(false);
    expect(q.correct).toBe(null);
    expect(userReset).toHaveBeenCalled();

    q.submit();
    expect(adapter.reportInteraction).toHaveBeenCalledTimes(2);
  });

  it('mode is "standalone" outside a Quiz', () => {
    const progress = new ProgressState();
    ctxStore.set('tessera-nav', makeNavCtx(progress));
    ctxStore.set('tessera-adapter', { adapter: makeAdapter() });

    const q = useQuestion({
      id: 'q1',
      response: () => ({ type: 'true-false', response: true }),
    });
    expect(q.mode).toBe('standalone');
  });

  it('reports correct=null when interaction has no correct answer', () => {
    const progress = new ProgressState();
    const adapter = makeAdapter();
    ctxStore.set('tessera-nav', makeNavCtx(progress));
    ctxStore.set('tessera-adapter', { adapter });

    const q = useQuestion({
      id: 'q1',
      response: () => ({ type: 'likert', response: 'agree' }),
    });
    q.submit();

    expect(adapter.reportInteraction).toHaveBeenCalledWith(
      'q1',
      expect.any(Object),
      null
    );
    expect(q.correct).toBe(null);
  });
});

// ============ useQuestion — standalone retry ============

describe('useQuestion — standalone retry', () => {
  function setupCtx() {
    const progress = new ProgressState();
    const adapter = makeAdapter();
    ctxStore.set('tessera-nav', makeNavCtx(progress));
    ctxStore.set('tessera-adapter', { adapter });
    return { progress, adapter };
  }

  it('canRetry defaults to true and retryCount starts at 0 (default Infinity cap)', () => {
    setupCtx();
    const q = useQuestion({
      id: 'q1',
      response: () => ({ type: 'true-false', response: true, correct: true }),
    });
    expect(q.canRetry).toBe(true);
    expect(q.retryCount).toBe(0);
  });

  it('retry() resets submitted/correct, calls opts.reset, and increments retryCount', () => {
    const { adapter } = setupCtx();
    const userReset = vi.fn();
    const q = useQuestion({
      id: 'q1',
      maxRetries: 2,
      response: () => ({ type: 'true-false', response: true, correct: true }),
      reset: userReset,
    });
    q.submit();
    expect(q.submitted).toBe(true);
    expect(q.correct).toBe(true);

    q.retry();

    expect(q.submitted).toBe(false);
    expect(q.correct).toBe(null);
    expect(q.retryCount).toBe(1);
    expect(userReset).toHaveBeenCalledTimes(1);

    // Resubmit reports a fresh interaction (not deduped against the prior submit).
    q.submit();
    expect(adapter.reportInteraction).toHaveBeenCalledTimes(2);
  });

  it('canRetry flips false when retryCount reaches maxRetries; further retry() is a no-op', () => {
    const { adapter } = setupCtx();
    const userReset = vi.fn();
    const q = useQuestion({
      id: 'q1',
      maxRetries: 2,
      response: () => ({ type: 'true-false', response: false, correct: true }),
      reset: userReset,
    });

    q.submit();
    q.retry();
    expect(q.canRetry).toBe(true);
    expect(q.retryCount).toBe(1);

    q.submit();
    q.retry();
    expect(q.canRetry).toBe(false);
    expect(q.retryCount).toBe(2);

    // Cap reached — retry no-ops, retryCount and reset count don't move.
    q.submit();
    q.retry();
    expect(q.retryCount).toBe(2);
    expect(userReset).toHaveBeenCalledTimes(2);
    // The third submit still reported (reset wasn't called, but submit() ran before retry no-op).
    expect(adapter.reportInteraction).toHaveBeenCalledTimes(3);
  });

  it('maxRetries: 0 means canRetry is false from the start', () => {
    setupCtx();
    const q = useQuestion({
      id: 'q1',
      maxRetries: 0,
      response: () => ({ type: 'true-false', response: true, correct: true }),
    });
    expect(q.canRetry).toBe(false);
    q.submit();
    q.retry();
    expect(q.retryCount).toBe(0);
    expect(q.submitted).toBe(true);
  });
});

// ============ useQuestion (inside a <Quiz>) ============

function makeQuizCtx(overrides: Record<string, unknown> = {}) {
  const quiz: any = {
    submitted: false,
    registerQuestion: vi.fn(),
    ...overrides,
  };
  let nextIndex = 0;
  quiz.registerQuestion.mockImplementation(() => nextIndex++);
  return quiz;
}

describe('useQuestion — inside a <Quiz>', () => {
  it('registers with the parent Quiz exactly once', () => {
    const progress = new ProgressState();
    const quiz = makeQuizCtx();
    ctxStore.set('tessera-quiz', quiz);
    ctxStore.set('tessera-nav', makeNavCtx(progress));
    ctxStore.set('tessera-adapter', { adapter: makeAdapter() });

    const q = useQuestion({
      id: 'q1',
      response: () => ({ type: 'true-false', response: true, correct: true }),
    });

    expect(q.mode).toBe('quiz');
    expect(quiz.registerQuestion).toHaveBeenCalledTimes(1);
    const arg = quiz.registerQuestion.mock.calls[0][0];
    expect(arg.id).toBe('q1');
    expect(typeof arg.checkAnswer).toBe('function');
    expect(typeof arg.interaction).toBe('function');
  });

  it('exposes the quiz-returned index on the handle', () => {
    const progress = new ProgressState();
    const quiz = makeQuizCtx();
    ctxStore.set('tessera-quiz', quiz);
    ctxStore.set('tessera-nav', makeNavCtx(progress));
    ctxStore.set('tessera-adapter', { adapter: makeAdapter() });

    const a = useQuestion({ id: 'a', response: () => ({ type: 'true-false', response: true }) });
    const b = useQuestion({ id: 'b', response: () => ({ type: 'true-false', response: false }) });
    expect(a.quizIndex).toBe(0);
    expect(b.quizIndex).toBe(1);
  });

  it('interaction() callback returns the latest response value (not memoized)', () => {
    const progress = new ProgressState();
    const quiz = makeQuizCtx();
    ctxStore.set('tessera-quiz', quiz);
    ctxStore.set('tessera-nav', makeNavCtx(progress));
    ctxStore.set('tessera-adapter', { adapter: makeAdapter() });

    let current: Interaction = { type: 'true-false', response: false, correct: true };
    useQuestion({ id: 'q1', response: () => current });

    const arg = quiz.registerQuestion.mock.calls[0][0];
    expect(arg.interaction()).toEqual({ type: 'true-false', response: false, correct: true });
    current = { type: 'true-false', response: true, correct: true };
    expect(arg.interaction()).toEqual({ type: 'true-false', response: true, correct: true });
  });

  it('checkAnswer() returns the boolean from isCorrect(response())', () => {
    const progress = new ProgressState();
    const quiz = makeQuizCtx();
    ctxStore.set('tessera-quiz', quiz);
    ctxStore.set('tessera-nav', makeNavCtx(progress));
    ctxStore.set('tessera-adapter', { adapter: makeAdapter() });

    let current: Interaction = { type: 'true-false', response: true, correct: true };
    useQuestion({ id: 'q1', response: () => current });

    const arg = quiz.registerQuestion.mock.calls[0][0];
    expect(arg.checkAnswer()).toBe(true);
    current = { type: 'true-false', response: false, correct: true };
    expect(arg.checkAnswer()).toBe(false);
  });

  it('reset is passed through to the quiz registration', () => {
    const progress = new ProgressState();
    const quiz = makeQuizCtx();
    ctxStore.set('tessera-quiz', quiz);
    ctxStore.set('tessera-nav', makeNavCtx(progress));
    ctxStore.set('tessera-adapter', { adapter: makeAdapter() });

    const userReset = vi.fn();
    useQuestion({
      id: 'q1',
      response: () => ({ type: 'true-false', response: true }),
      reset: userReset,
    });

    const arg = quiz.registerQuestion.mock.calls[0][0];
    expect(arg.reset).toBe(userReset);
  });

  it('handle.submit() is a no-op when nested in a quiz', () => {
    const progress = new ProgressState();
    const quiz = makeQuizCtx();
    const adapter = makeAdapter();
    ctxStore.set('tessera-quiz', quiz);
    ctxStore.set('tessera-nav', makeNavCtx(progress));
    ctxStore.set('tessera-adapter', { adapter });

    const q = useQuestion({
      id: 'q1',
      response: () => ({ type: 'true-false', response: true, correct: true }),
    });
    q.submit();
    q.submit();

    expect(adapter.reportInteraction).not.toHaveBeenCalled();
    expect(progress.standaloneQuestionScores.size).toBe(0);
  });

  it('does not mark standaloneQuestionScores even when graded is true (quiz drives scoring)', () => {
    const progress = new ProgressState();
    const quiz = makeQuizCtx();
    ctxStore.set('tessera-quiz', quiz);
    ctxStore.set('tessera-nav', makeNavCtx(progress, 3));
    ctxStore.set('tessera-adapter', { adapter: makeAdapter() });

    const q = useQuestion({
      id: 'q1',
      graded: true,
      response: () => ({ type: 'true-false', response: true, correct: true }),
    });
    q.submit();

    expect(progress.standaloneQuestionScores.size).toBe(0);
    expect(progress.gradedStandalonePages.has(3)).toBe(false);
  });

  it('handle.submitted mirrors quiz.submitted', () => {
    const progress = new ProgressState();
    const quiz = makeQuizCtx();
    ctxStore.set('tessera-quiz', quiz);
    ctxStore.set('tessera-nav', makeNavCtx(progress));
    ctxStore.set('tessera-adapter', { adapter: makeAdapter() });

    const q = useQuestion({
      id: 'q1',
      response: () => ({ type: 'true-false', response: true, correct: true }),
    });
    expect(q.submitted).toBe(false);
    expect(q.correct).toBe(null);

    quiz.submitted = true;
    expect(q.submitted).toBe(true);
    expect(q.correct).toBe(true);
  });

  it('handle.reset calls opts.reset but does not reset the whole quiz', () => {
    const progress = new ProgressState();
    const quiz = makeQuizCtx();
    ctxStore.set('tessera-quiz', quiz);
    ctxStore.set('tessera-nav', makeNavCtx(progress));
    ctxStore.set('tessera-adapter', { adapter: makeAdapter() });

    const userReset = vi.fn();
    const q = useQuestion({
      id: 'q1',
      response: () => ({ type: 'true-false', response: true }),
      reset: userReset,
    });
    q.reset();

    expect(userReset).toHaveBeenCalledTimes(1);
  });

  it('retry() is a no-op inside a quiz; canRetry is always false', () => {
    const progress = new ProgressState();
    const quiz = makeQuizCtx();
    ctxStore.set('tessera-quiz', quiz);
    ctxStore.set('tessera-nav', makeNavCtx(progress));
    ctxStore.set('tessera-adapter', { adapter: makeAdapter() });

    const userReset = vi.fn();
    const q = useQuestion({
      id: 'q1',
      maxRetries: 5,
      response: () => ({ type: 'true-false', response: true }),
      reset: userReset,
    });

    expect(q.canRetry).toBe(false);
    q.retry();
    expect(q.retryCount).toBe(0);
    expect(userReset).not.toHaveBeenCalled();
  });

});

// ============ useNavigation ============

describe('useNavigation', () => {
  it('throws when no nav context exists', () => {
    expect(() => useNavigation()).toThrow(/inside a Tessera course/);
  });

  it('exposes currentPage, currentPageIndex, and pages from nav context', () => {
    const progress = new ProgressState();
    const ctx = makeNavCtx(progress, 2);
    ctxStore.set('tessera-nav', ctx);

    const navHook = useNavigation();
    expect(navHook.currentPageIndex).toBe(2);
    expect(navHook.currentPage).toEqual(ctx.manifest.pages[2]);
    expect(navHook.pages).toBe(ctx.manifest.pages);
  });

  it('goTo(slug) finds the matching page and calls nav.goToPage', () => {
    const progress = new ProgressState();
    const ctx = makeNavCtx(progress, 0);
    ctxStore.set('tessera-nav', ctx);

    useNavigation().goTo('page-3');
    expect(ctx.nav.goToPage).toHaveBeenCalledWith(3);
  });

  it('goTo(unknown slug) is a no-op', () => {
    const progress = new ProgressState();
    const ctx = makeNavCtx(progress, 0);
    ctxStore.set('tessera-nav', ctx);

    useNavigation().goTo('does-not-exist');
    expect(ctx.nav.goToPage).not.toHaveBeenCalled();
  });

  it('next/prev/canGoNext/canGoPrev delegate to nav', () => {
    const progress = new ProgressState();
    const ctx = makeNavCtx(progress, 0);
    ctxStore.set('tessera-nav', ctx);

    const h = useNavigation();
    h.next();
    h.prev();
    expect(ctx.nav.goNext).toHaveBeenCalled();
    expect(ctx.nav.goPrev).toHaveBeenCalled();
    expect(h.canGoNext).toBe(true);
    expect(h.canGoPrev).toBe(false);
  });

  it('canAccess returns false for unknown slug, true when nav.isPageLocked is false', () => {
    const progress = new ProgressState();
    const ctx = makeNavCtx(progress, 0);
    ctxStore.set('tessera-nav', ctx);

    const h = useNavigation();
    expect(h.canAccess('page-1')).toBe(true);
    expect(h.canAccess('does-not-exist')).toBe(false);

    ctx.nav.isPageLocked = vi.fn(() => true);
    expect(h.canAccess('page-1')).toBe(false);
  });

  it('canAccess honors a custom config.navigation.canAccess', () => {
    const progress = new ProgressState();
    const manifest = createManifest(3);
    const config = createConfig({
      navigation: {
        mode: 'free',
        canAccess: ({ pageIndex }) => pageIndex === 0,
      },
    });
    const nav = new NavigationState(manifest, progress, config);
    ctxStore.set('tessera-nav', { nav, manifest, progress, config });

    const h = useNavigation();
    expect(h.canAccess('page-0')).toBe(true);
    expect(h.canAccess('page-1')).toBe(false);
    expect(h.canAccess('page-2')).toBe(false);
  });
});

// ============ useProgress ============

describe('useProgress', () => {
  it('throws when no nav context exists', () => {
    expect(() => useProgress()).toThrow(/inside a Tessera course/);
  });

  it('exposes reactive ProgressState fields', () => {
    const progress = new ProgressState();
    progress.markVisited(0);
    progress.markVisited(1);
    progress.quizCompleted(2, 80);
    ctxStore.set('tessera-nav', makeNavCtx(progress));

    const h = useProgress();
    expect(h.visitedPages.size).toBe(2);
    expect(h.quizScores.get(2)).toBe(80);
    expect(h.completionStatus).toBe('incomplete');
    expect(h.successStatus).toBe('unknown');
  });

  it('markVisited and markChunk delegate to ProgressState', () => {
    const progress = new ProgressState();
    ctxStore.set('tessera-nav', makeNavCtx(progress));

    const h = useProgress();
    h.markVisited(3);
    h.markChunk(3, 1);

    expect(progress.visitedPages.has(3)).toBe(true);
    expect(progress.getChunk(3)).toBe(1);
  });
});

// ============ usePersistence ============

describe('usePersistence', () => {
  function makeStore() {
    const data: Record<string, unknown> = {};
    return {
      data,
      get: (k: string) => (k in data ? data[k] : null),
      set: (k: string, v: unknown) => { data[k] = v; },
    };
  }

  it('throws when no user-state context exists', () => {
    expect(() => usePersistence('foo')).toThrow(/inside a Tessera course/);
  });

  it('get returns null before any set', () => {
    ctxStore.set('tessera-user-state', makeStore());
    expect(usePersistence('foo').get()).toBe(null);
  });

  it('set stores under the namespaced key; get returns it', () => {
    ctxStore.set('tessera-user-state', makeStore());
    const p = usePersistence<{ x: number }>('foo');
    p.set({ x: 42 });
    expect(p.get()).toEqual({ x: 42 });
  });

  it('keys are isolated between callers', () => {
    ctxStore.set('tessera-user-state', makeStore());
    const a = usePersistence<number>('a');
    const b = usePersistence<number>('b');
    a.set(1);
    b.set(2);
    expect(a.get()).toBe(1);
    expect(b.get()).toBe(2);
  });

  it('values survive across hook calls (reads from shared store)', () => {
    ctxStore.set('tessera-user-state', makeStore());
    usePersistence<string>('greeting').set('hello');
    // simulating a later remount of a widget binding to the same key
    expect(usePersistence<string>('greeting').get()).toBe('hello');
  });
});
