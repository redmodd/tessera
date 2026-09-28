import { describe, it, expect, beforeEach, vi } from 'vitest';

// ---- createContext mock ----
// The hooks run outside a component here, so each context reads and writes a
// per-test map instead. `get` throws on a missing context, as Svelte's does.
const ctxStore = new Map<object, unknown>();

vi.mock('svelte', async () => {
  const actual = await vi.importActual<typeof import('svelte')>('svelte');
  return {
    ...actual,
    createContext: () => {
      const key = {};
      return [
        () => {
          if (!ctxStore.has(key)) throw new Error('missing_context');
          return ctxStore.get(key);
        },
        (value: unknown) => {
          ctxStore.set(key, value);
          return value;
        },
        () => ctxStore.has(key),
      ];
    },
  };
});

import {
  useQuestion,
  useNavigation,
  useProgress,
  usePersistence,
  useCourse,
  useCompletion,
  setQuizContext,
} from '../src/runtime/hooks.svelte.js';
import type { Interaction } from '../src/runtime/interaction.js';
import type { UseQuizQuestionApi } from '../src/runtime/hooks.svelte.js';
import { ProgressState } from '../src/runtime/progress.svelte.js';
import * as runtimeContexts from '../src/runtime/contexts.js';
import type { Manifest } from '../src/plugin/manifest.js';
import type { CourseConfig } from '../src/runtime/types.js';
import {
  createManifest,
  createConfig,
  manualConfig,
  stubAdapter,
} from './helpers.js';

function provideNavCtx({
  manifest = createManifest(5),
  config = createConfig(),
  pageIndex = 0,
  contexts = runtimeContexts,
}: {
  manifest?: Manifest;
  config?: CourseConfig;
  pageIndex?: number;
  contexts?: typeof runtimeContexts;
} = {}) {
  const progress = new ProgressState(manifest, config);
  const nav: any = {
    currentPageIndex: pageIndex,
    canGoNext: true,
    canGoPrev: false,
    goToPage: vi.fn((i: number) => {
      nav.currentPageIndex = i;
    }),
    goNext: vi.fn(),
    goPrev: vi.fn(),
    canAccessIndex: vi.fn(() => true),
    prefetch: vi.fn(),
  };
  const ctx = {
    nav,
    manifest,
    progress,
    config,
    canExit: true,
    exit: vi.fn(async () => {}),
  };
  const adapter = stubAdapter({ reportInteraction: vi.fn() });
  contexts.setNavContext(ctx);
  contexts.setAdapterContext({ adapter });
  contexts.setPageContext({
    quiz: null,
    quizState: null,
    passingScore: 70,
    index: pageIndex,
  });
  contexts.setInPage(true);
  return { ...ctx, adapter };
}

beforeEach(() => {
  ctxStore.clear();
});

// ============ useQuestion (standalone) ============

describe('useQuestion — standalone mode', () => {
  it('reports the interaction through the adapter on submit', () => {
    const { adapter } = provideNavCtx();

    const interaction: Interaction = {
      type: 'choice',
      response: ['a'],
      correct: ['a'],
    };
    const q = useQuestion({ id: 'q1', response: () => interaction });
    q.submit();

    expect(adapter.reportInteraction).toHaveBeenCalledWith(
      'q1',
      interaction,
      true,
    );
    expect(q.submitted).toBe(true);
    expect(q.correct).toBe(true);
  });

  it('throws in dev when a graded question registers on an undeclared page', () => {
    provideNavCtx({ manifest: createManifest(2) });

    expect(() =>
      useQuestion({
        id: 'q1',
        graded: true,
        response: () => ({ type: 'true-false', response: true, correct: true }),
      }),
    ).toThrow(/page "page-0" has a graded question but does not declare/);
    expect(() =>
      useQuestion({
        id: 'q2',
        response: () => ({ type: 'true-false', response: true, correct: true }),
      }),
    ).not.toThrow();
  });

  it('warns once in production when a graded question registers on an undeclared page, not on restore', () => {
    vi.stubEnv('DEV', false);
    const { progress } = provideNavCtx({ manifest: createManifest(2) });

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    progress.markStandaloneQuestion(0, 'q0', 100, true);
    expect(warn).not.toHaveBeenCalled();

    const response = () =>
      ({ type: 'true-false', response: true, correct: true }) as Interaction;
    useQuestion({ id: 'q1', graded: true, response }).submit();
    useQuestion({ id: 'q2', graded: true, response }).submit();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('page "page-0"');
    expect(warn.mock.calls[0][0]).toContain('does not declare');
    expect(progress.pageScore(0)).toBe(100);
  });

  it('does not throw for a graded question on a declared page', () => {
    provideNavCtx({ manifest: createManifest(2, {}, { 0: { graded: true } }) });

    expect(() =>
      useQuestion({
        id: 'q1',
        graded: true,
        response: () => ({ type: 'true-false', response: true, correct: true }),
      }),
    ).not.toThrow();
  });

  it('is not answerComplete until an answer is set, with no complete callback', () => {
    provideNavCtx();

    const q = useQuestion({
      id: 'q1',
      response: () => ({ type: 'choice', response: ['a'], correct: ['a'] }),
    });

    expect(q.answerComplete).toBe(false);
    q.setAnswer('a');
    expect(q.answerComplete).toBe(true);
  });

  it('flags incorrect when response does not match', () => {
    const { adapter } = provideNavCtx();

    const q = useQuestion({
      id: 'q1',
      response: () => ({ type: 'true-false', response: false, correct: true }),
    });
    q.submit();

    expect(adapter.reportInteraction).toHaveBeenCalledWith(
      'q1',
      expect.objectContaining({ type: 'true-false' }),
      false,
    );
    expect(q.correct).toBe(false);
  });

  it('does not register a graded score when graded is false', () => {
    const { progress } = provideNavCtx({ pageIndex: 2 });

    const q = useQuestion({
      id: 'q1',
      response: () => ({ type: 'true-false', response: true, correct: true }),
    });
    q.submit();

    expect(progress.gradedUnits.get(2)?.questions?.get('q1')?.score).toBe(100);
    expect(progress.pageScore(2)).toBeUndefined();
  });

  it('registers a graded score when graded is true', () => {
    const { progress } = provideNavCtx({
      manifest: createManifest(4, {}, { 3: { graded: true } }),
      config: createConfig({ completion: { mode: 'quiz' } }),
      pageIndex: 3,
    });

    const q = useQuestion({
      id: 'q1',
      graded: true,
      response: () => ({ type: 'true-false', response: true, correct: true }),
    });
    q.submit();

    expect(progress.gradedUnits.get(3)?.questions?.get('q1')?.score).toBe(100);
    expect(progress.pageScore(3)).toBe(100);
    // Graded path also recalculates
    expect(progress.successStatus).toBe('passed');
  });

  it('records against the page it renders on while the next page loads', () => {
    const { nav, progress } = provideNavCtx({
      manifest: createManifest(
        3,
        {},
        { 1: { graded: true }, 2: { graded: true } },
      ),
      pageIndex: 1,
    });
    nav.currentPageIndex = 2;

    useQuestion({
      id: 'q1',
      graded: true,
      response: () => ({ type: 'true-false', response: true, correct: true }),
    }).submit();

    expect(progress.pageScore(1)).toBe(100);
    expect(progress.gradedUnits.has(2)).toBe(false);
  });

  it('uses score override when provided', () => {
    const { progress } = provideNavCtx({
      manifest: createManifest(2, {}, { 0: { graded: true } }),
    });

    const q = useQuestion({
      id: 'q1',
      graded: true,
      response: () => ({ type: 'true-false', response: false, correct: true }),
      score: () => 42,
    });
    q.submit();

    expect(progress.gradedUnits.get(0)?.questions?.get('q1')?.score).toBe(42);
  });

  it('passes weight through to the recorded result', () => {
    const { progress } = provideNavCtx({
      manifest: createManifest(2, {}, { 1: { graded: true } }),
      pageIndex: 1,
    });

    useQuestion({
      id: 'q1',
      graded: true,
      weight: 3,
      response: () => ({ type: 'true-false', response: true, correct: true }),
    }).submit();

    expect(progress.gradedUnits.get(1)?.questions?.get('q1')?.weight).toBe(3);
  });

  it('corrects a restored answer whose saved weight is out of date', () => {
    const { progress } = provideNavCtx({
      manifest: createManifest(2, {}, { 1: { graded: true } }),
      pageIndex: 1,
    });
    progress.markStandaloneQuestion(1, 'q1', 100, true, 3);

    useQuestion({
      id: 'q1',
      graded: true,
      weight: 5,
      response: () => ({ type: 'true-false', response: true, correct: true }),
    });

    expect(progress.gradedUnits.get(1)?.questions?.get('q1')).toEqual({
      score: 100,
      weight: 5,
      graded: true,
    });
  });

  it('submit is idempotent — calling twice does not double-report', () => {
    const { adapter } = provideNavCtx();

    const q = useQuestion({
      id: 'q1',
      response: () => ({ type: 'true-false', response: true, correct: true }),
    });
    q.submit();
    q.submit();
    expect(adapter.reportInteraction).toHaveBeenCalledTimes(1);
  });

  it('reset clears submitted/correct and re-enables submit', () => {
    const userReset = vi.fn();
    const { adapter } = provideNavCtx();

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
    provideNavCtx();

    const q = useQuestion({
      id: 'q1',
      response: () => ({ type: 'true-false', response: true }),
    });
    expect(q.mode).toBe('standalone');
  });

  it('reports correct=null when interaction has no correct answer', () => {
    const { adapter } = provideNavCtx();

    const q = useQuestion({
      id: 'q1',
      response: () => ({ type: 'likert', response: 'agree' }),
    });
    q.submit();

    expect(adapter.reportInteraction).toHaveBeenCalledWith(
      'q1',
      expect.any(Object),
      null,
    );
    expect(q.correct).toBe(null);
  });
});

// ============ useQuestion — standalone retry ============

describe('useQuestion — standalone retry', () => {
  it('canRetry defaults to true and retryCount starts at 0 (default Infinity cap)', () => {
    provideNavCtx();
    const q = useQuestion({
      id: 'q1',
      response: () => ({ type: 'true-false', response: true, correct: true }),
    });
    expect(q.canRetry).toBe(true);
    expect(q.retryCount).toBe(0);
  });

  it('retry() resets submitted/correct, calls opts.reset, and increments retryCount', () => {
    const { adapter } = provideNavCtx();
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
    const { adapter } = provideNavCtx();
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
    provideNavCtx();
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

function provideQuizCtx() {
  const quiz = {
    registerQuestion: vi.fn((api: UseQuizQuestionApi) => ({ id: api.id })),
  };
  setQuizContext(quiz as any);
  return quiz;
}

describe('useQuestion — inside a <Quiz>', () => {
  it('registers once and hands back the quiz registration', () => {
    const quiz = provideQuizCtx();
    provideNavCtx();

    const q = useQuestion({
      id: 'q1',
      response: () => ({ type: 'true-false', response: true, correct: true }),
    });

    expect(quiz.registerQuestion).toHaveBeenCalledTimes(1);
    expect(q).toBe(quiz.registerQuestion.mock.results[0].value);
    const arg = quiz.registerQuestion.mock.calls[0][0];
    expect(arg.id).toBe('q1');
    expect(typeof arg.checkAnswer).toBe('function');
    expect(typeof arg.interaction).toBe('function');
  });

  it('forwards each widget through to a distinct quiz registration', () => {
    const quiz = provideQuizCtx();
    provideNavCtx();

    const a = useQuestion({
      id: 'a',
      response: () => ({ type: 'true-false', response: true }),
    });
    const b = useQuestion({
      id: 'b',
      response: () => ({ type: 'true-false', response: false }),
    });
    expect(quiz.registerQuestion).toHaveBeenCalledTimes(2);
    expect(a.id).toBe('a');
    expect(b.id).toBe('b');
  });

  it('interaction() callback returns the latest response value (not memoized)', () => {
    const quiz = provideQuizCtx();
    provideNavCtx();

    let current: Interaction = {
      type: 'true-false',
      response: false,
      correct: true,
    };
    useQuestion({ id: 'q1', response: () => current });

    const arg = quiz.registerQuestion.mock.calls[0][0];
    expect(arg.interaction!()).toEqual({
      type: 'true-false',
      response: false,
      correct: true,
    });
    current = { type: 'true-false', response: true, correct: true };
    expect(arg.interaction!()).toEqual({
      type: 'true-false',
      response: true,
      correct: true,
    });
  });

  it('checkAnswer() returns the boolean from isCorrect(response())', () => {
    const quiz = provideQuizCtx();
    provideNavCtx();

    let current: Interaction = {
      type: 'true-false',
      response: true,
      correct: true,
    };
    useQuestion({ id: 'q1', response: () => current });

    const arg = quiz.registerQuestion.mock.calls[0][0];
    expect(arg.checkAnswer()).toBe(true);
    current = { type: 'true-false', response: false, correct: true };
    expect(arg.checkAnswer()).toBe(false);
  });

  it('reset is passed through to the quiz registration', () => {
    const quiz = provideQuizCtx();
    provideNavCtx();

    const userReset = vi.fn();
    useQuestion({
      id: 'q1',
      response: () => ({ type: 'true-false', response: true }),
      reset: userReset,
    });

    const arg = quiz.registerQuestion.mock.calls[0][0];
    expect(arg.reset).toBe(userReset);
  });

  it('records and reports nothing itself, even when graded (the quiz drives scoring)', () => {
    provideQuizCtx();
    const { progress, adapter } = provideNavCtx({ pageIndex: 3 });

    vi.spyOn(console, 'warn').mockImplementation(() => {});
    useQuestion({
      id: 'q1',
      graded: true,
      response: () => ({ type: 'true-false', response: true, correct: true }),
    });

    expect(adapter.reportInteraction).not.toHaveBeenCalled();
    expect(progress.gradedUnits.size).toBe(0);
  });

  it('warns in dev about standalone-only options passed inside a quiz', () => {
    provideQuizCtx();
    provideNavCtx();

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    useQuestion({
      id: 'q1',
      graded: true,
      maxRetries: 3,
      response: () => ({ type: 'true-false', response: true }),
    });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('graded, maxRetries');
  });
});

// ============ useNavigation ============

describe('useNavigation', () => {
  it('throws when no nav context exists', () => {
    expect(() => useNavigation()).toThrow(/inside a Tessera course/);
  });

  it('exposes currentPage, currentPageIndex, and pages from nav context', () => {
    const ctx = provideNavCtx({ pageIndex: 2 });

    const navHook = useNavigation();
    expect(navHook.currentPageIndex).toBe(2);
    expect(navHook.currentPage).toEqual(ctx.manifest.pages[2]);
    expect(navHook.pages).toBe(ctx.manifest.pages);
    expect(navHook.sections).toBe(ctx.manifest.sections);
  });

  it('goTo(slug) finds the matching page and calls nav.goToPage', () => {
    const ctx = provideNavCtx();

    useNavigation().goTo('page-3');
    expect(ctx.nav.goToPage).toHaveBeenCalledWith(3);
  });

  it('goTo(unknown slug) passes nav.goToPage an index that is not a page', () => {
    const ctx = provideNavCtx();

    useNavigation().goTo('does-not-exist');
    expect(ctx.nav.goToPage).toHaveBeenCalledWith(-1);
  });

  it('next/prev/prefetch/canGoNext/canGoPrev delegate to nav', () => {
    const ctx = provideNavCtx();

    const h = useNavigation();
    h.next();
    h.prev();
    h.prefetch(2);
    expect(ctx.nav.goNext).toHaveBeenCalled();
    expect(ctx.nav.goPrev).toHaveBeenCalled();
    expect(ctx.nav.prefetch).toHaveBeenCalledWith(2);
    expect(h.canGoNext).toBe(true);
    expect(h.canGoPrev).toBe(false);
  });

  it('canAccess and canAccessIndex delegate to nav.canAccessIndex', () => {
    const ctx = provideNavCtx();

    const h = useNavigation();
    expect(h.canAccess('page-1')).toBe(true);
    expect(ctx.nav.canAccessIndex).toHaveBeenLastCalledWith(1);
    h.canAccess('does-not-exist');
    expect(ctx.nav.canAccessIndex).toHaveBeenLastCalledWith(-1);

    ctx.nav.canAccessIndex = vi.fn(() => false);
    expect(h.canAccess('page-1')).toBe(false);
    expect(h.canAccessIndex(1)).toBe(false);
    expect(ctx.nav.canAccessIndex).toHaveBeenLastCalledWith(1);
  });
});

// ============ useProgress ============

describe('useProgress', () => {
  it('throws when no nav context exists', () => {
    expect(() => useProgress()).toThrow(/inside a Tessera course/);
  });

  it('exposes reactive ProgressState fields', () => {
    const { progress } = provideNavCtx();
    progress.markVisited(0);
    progress.markVisited(1);
    progress.quizCompleted(2, 80);

    const h = useProgress();
    expect(h.visitedPages.size).toBe(2);
    expect(h.completedPages).toBe(progress.completedPages);
    expect(h.quizScore(2)).toBe(80);
    expect(h.completionStatus).toBe('incomplete');
    expect(h.successStatus).toBe('unknown');
  });

  it('exposes the course-wide graded score and pass threshold', () => {
    const manifest = createManifest(4, {
      1: { graded: true },
      2: { graded: true },
    });
    const { progress } = provideNavCtx({
      manifest,
      config: createConfig({ scoring: { passingScore: 80 } }),
    });

    const h = useProgress();
    expect(h.passingScore).toBe(80);
    expect(h.gradedScore).toEqual({ average: 0, attempted: false });

    progress.quizCompleted(1, 90);
    expect(h.gradedScore).toEqual({ average: 45, attempted: true });

    progress.quizCompleted(2, 70);
    expect(h.gradedScore).toEqual({ average: 80, attempted: true });
  });

  it('pageScore defaults to the page it renders on while the next page loads', () => {
    const { nav, progress } = provideNavCtx({ pageIndex: 2 });
    progress.markStandaloneQuestion(2, 'q1', 40, true);

    const h = useProgress();
    expect(h.pageScore()).toBe(40);

    nav.currentPageIndex = 3;
    expect(h.pageScore()).toBe(40);
    expect(h.pageScore(3)).toBeUndefined();
  });

  it('markVisited and markChunk delegate to ProgressState', () => {
    const { progress } = provideNavCtx();

    const h = useProgress();
    h.markVisited(3);
    h.markChunk(3, 1);

    expect(progress.visitedPages.has(3)).toBe(true);
    expect(progress.getChunk(3)).toBe(1);
  });
});

// ============ useCourse ============

describe('useCourse', () => {
  it('throws when no nav context exists', () => {
    expect(() => useCourse()).toThrow(/inside a Tessera course/);
  });

  it('exposes the course title and a resolved logo, treating an empty logo as absent', () => {
    const ctx = provideNavCtx();

    const h = useCourse();
    expect(h.title).toBe('Test');
    expect(h.logo).toBeUndefined();

    ctx.config.branding = { logo: '' };
    expect(h.logo).toBeUndefined();

    ctx.config.branding = { logo: 'https://example.com/logo.svg' };
    expect(h.logo).toBe('https://example.com/logo.svg');

    ctx.config.branding = { logo: '$assets/logo.svg' };
    expect(h.logo).toBe('./assets/logo.svg');
  });

  it('ends the session through the course', async () => {
    const ctx = provideNavCtx();

    const h = useCourse();
    expect(h.canExit).toBe(true);
    await h.exit();
    expect(ctx.exit).toHaveBeenCalledOnce();
  });
});

// ============ useCompletion ============

describe('useCompletion', () => {
  it('markComplete flips progress and reflects completionStatus', () => {
    const { progress } = provideNavCtx({ config: manualConfig() });

    const handle = useCompletion();
    expect(handle.completionStatus).toBe('incomplete');

    handle.markComplete();
    expect(progress.completionStatus).toBe('complete');
    expect(handle.completionStatus).toBe('complete');
  });

  it('markComplete is a no-op outside manual mode and warns once per session', async () => {
    vi.resetModules();
    const { useCompletion } = await import('../src/runtime/hooks.svelte.js');
    const contexts = await import('../src/runtime/contexts.js');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { progress } = provideNavCtx({ contexts });

    const handle = useCompletion();
    handle.markComplete();
    handle.markComplete();
    handle.markComplete();

    expect(progress.completionStatus).toBe('incomplete');
    // dev mode is true under vitest (import.meta.env.DEV)
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('throws when called outside a Tessera course', () => {
    expect(() => useCompletion()).toThrow(
      /must be called inside a Tessera course/,
    );
  });

  it('flips successStatus when requireSuccessStatus is set', () => {
    const { progress } = provideNavCtx({
      config: manualConfig({ requireSuccessStatus: 'passed' }),
    });

    const handle = useCompletion();
    handle.markComplete();
    expect(progress.successStatus).toBe('passed');
  });
});

// ============ usePersistence ============

describe('usePersistence', () => {
  function makeStore() {
    const data: Record<string, unknown> = {};
    return {
      data,
      get: (k: string) => (k in data ? data[k] : null),
      set: (k: string, v: unknown) => {
        data[k] = v;
      },
    };
  }

  it('throws when no user-state context exists', () => {
    expect(() => usePersistence('foo')).toThrow(/inside a Tessera course/);
  });

  it('get returns null before any set', () => {
    runtimeContexts.setUserStateStore(makeStore());
    expect(usePersistence('foo').get()).toBe(null);
  });

  it('set stores under the namespaced key; get returns it', () => {
    runtimeContexts.setUserStateStore(makeStore());
    const p = usePersistence<{ x: number }>('foo');
    p.set({ x: 42 });
    expect(p.get()).toEqual({ x: 42 });
  });

  it('keys are isolated between callers', () => {
    runtimeContexts.setUserStateStore(makeStore());
    const a = usePersistence<number>('a');
    const b = usePersistence<number>('b');
    a.set(1);
    b.set(2);
    expect(a.get()).toBe(1);
    expect(b.get()).toBe(2);
  });

  it('values survive across hook calls (reads from shared store)', () => {
    runtimeContexts.setUserStateStore(makeStore());
    usePersistence<string>('greeting').set('hello');
    // simulating a later remount of a widget binding to the same key
    expect(usePersistence<string>('greeting').get()).toBe('hello');
  });
});
