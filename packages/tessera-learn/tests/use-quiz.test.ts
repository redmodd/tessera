// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount, unmount } from 'svelte';
import HarnessSvelte from './fixtures/use-quiz-harness.svelte';
import type { Interaction } from '../src/runtime/interaction.js';
import type { QuizConfig } from '../src/runtime/types.js';
import { QuizEngine } from '../src/runtime/quiz-engine.svelte.js';
// The harness exposes the engine through the index-keyed internal seam; custom
// shells/widgets use the slim public UseQuizHandle.
import type { UseQuizInternalHandle as UseQuizHandle } from '../src/runtime/hooks.svelte.js';

// Most of useQuiz's behavior is now the framework-free QuizEngine, constructed
// directly with `dispatch` / `report` test doubles — no mount, no jsdom, no
// harness. Only the handful of tests whose subject *is* the Svelte wrapper
// (context wiring, the config throw, lifecycle warnings) still mount.

interface EngineProbe {
  engine: QuizEngine;
  /** Every dispatched host event, in order. */
  events: Array<{ name: string; detail: unknown }>;
  /** Every interaction reported to the (injected) adapter, in order. */
  reports: Array<{
    id: string;
    interaction: Interaction;
    correct: boolean | null;
  }>;
}

function makeEngine(
  quizConfig: Partial<QuizConfig> = { graded: true },
  opts: {
    passingScore?: number;
    hostNull?: boolean;
    restore?: { attempts: number; score: number };
  } = {},
): EngineProbe {
  const events: EngineProbe['events'] = [];
  const reports: EngineProbe['reports'] = [];
  const engine = new QuizEngine({
    quizConfig: quizConfig as QuizConfig,
    passingScore: () => opts.passingScore ?? 70,
    report: (id, interaction, correct) =>
      reports.push({ id, interaction, correct }),
    // dispatch() returns false when the host element is null; model that with hostNull.
    dispatch: (name, detail) => {
      if (opts.hostNull) return false;
      events.push({ name, detail });
      return true;
    },
    restore: opts.restore,
  });
  return { engine, events, reports };
}

function completeScore(events: EngineProbe['events']): number | undefined {
  const e = events.find((ev) => ev.name === 'tessera-quiz-complete');
  return e ? (e.detail as { score: number }).score : undefined;
}

function completes(events: EngineProbe['events']) {
  return events.filter((e) => e.name === 'tessera-quiz-complete');
}

function tfQuestion(id: string, response: boolean, correct: boolean) {
  return {
    id,
    checkAnswer: () => response === correct,
    interaction: (): Interaction => ({
      type: 'true-false' as const,
      response,
      correct,
    }),
  };
}

describe('QuizEngine', () => {
  it('starts in answering state with no questions', () => {
    const { engine } = makeEngine();
    expect(engine.state).toBe('answering');
    expect(engine.questions).toHaveLength(0);
    expect(engine.canSubmit).toBe(false);
    expect(engine.canRetry).toBe(false);
    expect(engine.score).toBe(0);
    expect(engine.attemptCount).toBe(0);
  });

  it('registerQuestion appends to questions in order, returning a handle per question', () => {
    const { engine } = makeEngine();
    const a = engine.registerQuestion(tfQuestion('a', true, true));
    const b = engine.registerQuestion(tfQuestion('b', false, true));
    const c = engine.registerQuestion(tfQuestion('c', true, true));
    expect(a.id).toBe('a');
    expect(b.id).toBe('b');
    expect(c.id).toBe('c');
    expect(engine.questions).toHaveLength(3);
    expect(engine.questions.map((qq) => qq.id)).toEqual(['a', 'b', 'c']);
  });

  it('canSubmit flips true once every registered question has an answer', () => {
    const { engine } = makeEngine();
    engine.registerQuestion(tfQuestion('a', true, true));
    engine.registerQuestion(tfQuestion('b', true, true));
    expect(engine.canSubmit).toBe(false);
    engine.setAnswer(0, true);
    expect(engine.canSubmit).toBe(false);
    engine.setAnswer(1, true);
    expect(engine.canSubmit).toBe(true);
  });

  it('canSubmit stays false while an answer is only partially built', () => {
    const { engine } = makeEngine();
    let filled = 0;
    engine.registerQuestion({
      ...tfQuestion('a', true, true),
      complete: () => filled === 2,
    });
    engine.registerQuestion(tfQuestion('b', true, true));
    engine.setAnswer(0, true);
    engine.setAnswer(1, true);
    expect(engine.canSubmit).toBe(false);
    filled = 2;
    expect(engine.canSubmit).toBe(true);
  });

  it('submit() dispatches tessera-quiz-complete with the rolled-up score', () => {
    const { engine, events } = makeEngine();
    engine.registerQuestion(tfQuestion('a', true, true)); // correct
    engine.registerQuestion(tfQuestion('b', false, true)); // wrong
    engine.setAnswer(0, true);
    engine.setAnswer(1, false);

    engine.submit();

    expect(completes(events)).toHaveLength(1);
    expect(completeScore(events)).toBe(50);
  });

  it('reads passingScore live so a late LMS mastery override is reflected', () => {
    // App.svelte applies an LMS-supplied masteryScore to pageContext.passingScore
    // *after* useQuiz() may already have mounted the quiz. The engine must read
    // the threshold on each access, not snapshot it at construction, or the
    // quiz's pass/fail UI diverges from the LMS success status.
    let passingScore = 70;
    const engine = new QuizEngine({
      quizConfig: { graded: true } as QuizConfig,
      passingScore: () => passingScore,
      report: () => {},
      dispatch: () => true,
    });

    expect(engine.passingScore).toBe(70);
    passingScore = 80; // LMS mastery 0.8 lands during adapter.init()
    expect(engine.passingScore).toBe(80);
  });

  it('reports each interaction to the adapter when the widget calls commit(), not on setAnswer', () => {
    const { engine, reports } = makeEngine();
    engine.registerQuestion(tfQuestion('a', true, true));
    engine.registerQuestion(tfQuestion('b', false, true));

    engine.setAnswer(0, true);
    engine.setAnswer(1, false);
    expect(reports).toHaveLength(0);

    engine.questions[0].commit();
    expect(reports.map((r) => [r.id, r.correct])).toEqual([['a', true]]);

    engine.questions[1].commit();
    expect(reports.map((r) => [r.id, r.correct])).toEqual([
      ['a', true],
      ['b', false],
    ]);

    engine.submit();
    expect(reports).toHaveLength(2);
  });

  it('submit() reports any questions whose widget never called commit()', () => {
    const { engine, reports } = makeEngine();
    engine.registerQuestion(tfQuestion('a', true, true));
    engine.registerQuestion(tfQuestion('b', false, true));
    engine.setAnswer(0, true);
    engine.setAnswer(1, false);
    engine.submit();
    expect(reports.map((r) => r.id)).toEqual(['a', 'b']);
  });

  it('does not re-report a question whose answer was already committed before submit', () => {
    const { engine, reports } = makeEngine();
    engine.registerQuestion(tfQuestion('a', true, true));
    engine.setAnswer(0, true);
    engine.questions[0].commit();
    engine.submit();
    expect(reports.map((r) => r.id)).toEqual(['a']);
  });

  it('re-reports when commit() is called after the answer changes', () => {
    const { engine, reports } = makeEngine();
    engine.registerQuestion({
      id: 'a',
      checkAnswer: () => engine.getAnswer(0) === true,
      interaction: () => ({
        type: 'true-false',
        response: engine.getAnswer(0) === true,
        correct: true,
      }),
    });
    engine.setAnswer(0, false);
    engine.questions[0].commit();
    engine.setAnswer(0, true);
    engine.questions[0].commit();
    expect(reports.map((r) => [r.id, r.correct])).toEqual([
      ['a', false],
      ['a', true],
    ]);
  });

  it('is a no-op when commit() is called twice with the same answer', () => {
    const { engine, reports } = makeEngine();
    engine.registerQuestion(tfQuestion('a', true, true));
    engine.setAnswer(0, true);
    engine.questions[0].commit();
    engine.questions[0].commit();
    expect(reports.map((r) => r.id)).toEqual(['a']);
  });

  it('re-reports after retry() so a second attempt produces fresh statements', () => {
    const { engine, reports } = makeEngine();
    engine.registerQuestion(tfQuestion('a', false, true));
    engine.setAnswer(0, false);
    engine.submit();
    expect(reports).toHaveLength(1);
    engine.retry();
    engine.setAnswer(0, false);
    engine.submit();
    expect(reports).toHaveLength(2);
  });

  it('submit() is the only sanctioned dispatcher — calling twice does not double-fire', () => {
    const { engine, events } = makeEngine();
    engine.registerQuestion(tfQuestion('a', true, true));
    engine.setAnswer(0, true);
    engine.submit();
    engine.submit();
    expect(completes(events)).toHaveLength(1);
  });

  it('submit() refuses to fire until every question is answered', () => {
    const { engine, events } = makeEngine();
    engine.registerQuestion(tfQuestion('a', true, true));
    engine.registerQuestion(tfQuestion('b', true, true));
    engine.setAnswer(0, true);
    engine.submit();
    expect(completes(events)).toHaveLength(0);
    expect(engine.state).toBe('answering');
  });

  it('after submit, questions[*].correct reports per-question pass/fail', () => {
    const { engine } = makeEngine();
    engine.registerQuestion(tfQuestion('a', true, true));
    engine.registerQuestion(tfQuestion('b', false, true));
    engine.setAnswer(0, true);
    engine.setAnswer(1, false);
    engine.submit();

    expect(engine.questions[0].correct).toBe(true);
    expect(engine.questions[1].correct).toBe(false);
    expect(engine.questions[0].submitted).toBe(true);
    expect(engine.state).toBe('submitted');
  });

  it('startReview / exitReview toggle the reviewing sub-state', () => {
    const { engine } = makeEngine();
    engine.registerQuestion(tfQuestion('a', true, true));
    engine.setAnswer(0, true);
    engine.submit();
    expect(engine.state).toBe('submitted');
    engine.startReview();
    expect(engine.state).toBe('reviewing');
    engine.exitReview();
    expect(engine.state).toBe('submitted');
  });

  it('startReview is a no-op before submit', () => {
    const { engine } = makeEngine();
    engine.registerQuestion(tfQuestion('a', true, true));
    engine.setAnswer(0, true);
    engine.startReview();
    expect(engine.state).toBe('answering');
  });

  it('retry() resets state and bumps attemptCount', () => {
    const { engine } = makeEngine();
    engine.registerQuestion(tfQuestion('a', true, true));
    engine.setAnswer(0, true);
    engine.submit();
    expect(engine.attemptCount).toBe(1);
    expect(engine.canRetry).toBe(true);
    engine.retry();
    expect(engine.state).toBe('answering');
    expect(engine.score).toBe(0);
    expect(engine.getAnswer(0)).toBeUndefined();
  });

  it('canRetry respects maxAttempts', () => {
    const { engine } = makeEngine({ graded: true, maxAttempts: 2 });
    engine.registerQuestion(tfQuestion('a', false, true));
    engine.setAnswer(0, false);

    engine.submit();
    expect(engine.attemptCount).toBe(1);
    expect(engine.canRetry).toBe(true);

    engine.retry();
    engine.setAnswer(0, false);
    engine.submit();
    expect(engine.attemptCount).toBe(2);
    expect(engine.canRetry).toBe(false);
  });

  it('keeps the best score across attempts while score follows the last one', () => {
    let correct = true;
    const swingQuestion = {
      id: 'a',
      checkAnswer: () => correct,
      interaction: (): Interaction => ({
        type: 'true-false' as const,
        response: true,
        correct: true,
      }),
    };
    const { engine } = makeEngine({ graded: true, maxAttempts: 3 });
    engine.registerQuestion(swingQuestion);
    engine.setAnswer(0, true);
    engine.submit();
    expect(engine.score).toBe(100);
    expect(engine.bestScore).toBe(100);

    correct = false;
    engine.retry();
    engine.setAnswer(0, false);
    engine.submit();
    expect(engine.score).toBe(0);
    expect(engine.bestScore).toBe(100);
  });

  it('seeds bestScore from a restored result', () => {
    const { engine } = makeEngine(
      { graded: true, maxAttempts: 3 },
      { restore: { attempts: 1, score: 80 } },
    );
    engine.registerQuestion(tfQuestion('a', true, false));
    expect(engine.bestScore).toBe(80);

    engine.retry();
    engine.setAnswer(0, true);
    engine.submit();
    expect(engine.score).toBe(0);
    expect(engine.bestScore).toBe(80);
  });

  describe('restored attempts', () => {
    it('starts in the results phase with the saved score', () => {
      const { engine } = makeEngine(
        { graded: true },
        { restore: { attempts: 1, score: 80 } },
      );
      engine.registerQuestion(tfQuestion('a', true, true));
      expect(engine.state).toBe('submitted');
      expect(engine.score).toBe(80);
      expect(engine.attemptCount).toBe(1);
      expect(engine.restored).toBe(true);
      expect(engine.canSubmit).toBe(false);
    });

    it('spends the restored attempts against maxAttempts', () => {
      const { engine } = makeEngine(
        { graded: true, maxAttempts: 2 },
        { restore: { attempts: 2, score: 40 } },
      );
      engine.registerQuestion(tfQuestion('a', true, true));
      expect(engine.canRetry).toBe(false);
      expect(engine.score).toBe(40);
    });

    it('retry clears the restored flag and continues counting attempts', () => {
      const { engine, events } = makeEngine(
        { graded: true, maxAttempts: 3 },
        { restore: { attempts: 1, score: 40 } },
      );
      engine.registerQuestion(tfQuestion('a', true, true));
      expect(engine.canRetry).toBe(true);
      engine.retry();
      expect(engine.restored).toBe(false);
      expect(engine.state).toBe('answering');
      engine.setAnswer(0, true);
      engine.submit();
      expect(engine.attemptCount).toBe(2);
      expect(completeScore(events)).toBe(100);
    });

    it('does not review answers it never had', () => {
      const { engine } = makeEngine(
        { graded: true },
        { restore: { attempts: 1, score: 80 } },
      );
      engine.registerQuestion(tfQuestion('a', true, true));
      engine.startReview();
      expect(engine.state).toBe('submitted');
    });

    it('reports correct as null rather than flagging every question wrong', () => {
      const { engine } = makeEngine(
        { graded: true },
        { restore: { attempts: 1, score: 100 } },
      );
      engine.registerQuestion(tfQuestion('a', true, true));
      engine.registerQuestion(tfQuestion('b', true, true));
      expect(engine.questions.map((q) => q.correct)).toEqual([null, null]);
      expect(engine.questions.every((q) => q.feedbackVisible)).toBe(false);
    });

    it('ignores a zero-attempt restore', () => {
      const { engine } = makeEngine(
        { graded: true },
        { restore: { attempts: 0, score: 0 } },
      );
      engine.registerQuestion(tfQuestion('a', true, true));
      expect(engine.state).toBe('answering');
      expect(engine.restored).toBe(false);
    });
  });

  it('incorrect-only retry preserves correct answers and locks them', () => {
    const { engine } = makeEngine({
      graded: true,
      retryMode: 'incorrect-only',
    });

    const aResp = true;
    const bResp = false;
    engine.registerQuestion({
      id: 'a',
      checkAnswer: () => aResp === true,
      interaction: () => ({
        type: 'true-false',
        response: aResp,
        correct: true,
      }),
    });
    engine.registerQuestion({
      id: 'b',
      checkAnswer: () => bResp === true,
      interaction: () => ({
        type: 'true-false',
        response: bResp,
        correct: true,
      }),
    });
    engine.setAnswer(0, true);
    engine.setAnswer(1, false);
    engine.submit();

    engine.retry();
    expect(engine.isLockedCorrect(0)).toBe(true);
    expect(engine.isLockedCorrect(1)).toBe(false);
    expect(engine.getAnswer(0)).toBe(true);
    expect(engine.getAnswer(1)).toBeUndefined();
  });

  it('full retry (default) clears every answer and resets every question', () => {
    const { engine } = makeEngine();
    const resetA = vi.fn();
    const resetB = vi.fn();
    engine.registerQuestion({ ...tfQuestion('a', true, true), reset: resetA });
    engine.registerQuestion({ ...tfQuestion('b', true, true), reset: resetB });
    engine.setAnswer(0, true);
    engine.setAnswer(1, true);
    engine.submit();

    engine.retry();
    expect(resetA).toHaveBeenCalledTimes(1);
    expect(resetB).toHaveBeenCalledTimes(1);
    expect(engine.getAnswer(0)).toBeUndefined();
    expect(engine.getAnswer(1)).toBeUndefined();
  });

  it('revealFeedback flips feedbackVisible for a question', () => {
    const { engine } = makeEngine({ graded: true, feedbackMode: 'immediate' });
    const a = engine.registerQuestion(tfQuestion('a', true, true));
    expect(a.feedbackVisible).toBe(false);
    expect(engine.feedbackVisible(0)).toBe(false);
    engine.revealFeedback(a);
    expect(a.feedbackVisible).toBe(true);
    expect(engine.feedbackVisible(0)).toBe(true);
  });

  it('correct is a boolean once feedback is visible, before submit', () => {
    const { engine } = makeEngine({ graded: true, feedbackMode: 'immediate' });
    const a = engine.registerQuestion(tfQuestion('a', true, true));
    const b = engine.registerQuestion(tfQuestion('b', false, true));
    expect(a.correct).toBeNull();
    engine.revealFeedback(a);
    expect(a.correct).toBe(true);
    expect(b.correct).toBeNull();
    engine.revealFeedback(b);
    expect(b.correct).toBe(false);
  });

  it('setRender stores the snippet returned via getRender', () => {
    const { engine } = makeEngine();
    engine.registerQuestion(tfQuestion('a', true, true));
    const snippet = () => 'rendered';
    engine.setRender(0, snippet);
    expect(engine.getRender(0)).toBe(snippet);
  });

  it('reportInteraction skips questions that do not expose interaction()', () => {
    const { engine, reports } = makeEngine();
    engine.registerQuestion(tfQuestion('a', true, true));
    engine.registerQuestion({
      id: 'b',
      checkAnswer: () => true,
      interaction: undefined as unknown as () => Interaction,
    });
    engine.setAnswer(0, true);
    engine.setAnswer(1, true);
    engine.submit();

    expect(reports.map((r) => [r.id, r.interaction, r.correct])).toEqual([
      ['a', { type: 'true-false', response: true, correct: true }, true],
    ]);
  });

  it('weighted score — Σ(w·correct)/Σ(w)*100 with mixed weights', () => {
    const { engine, events } = makeEngine();
    // 3-point question correct, 1-point question wrong → 75
    engine.registerQuestion({
      id: 'a',
      weight: 3,
      checkAnswer: () => true,
      interaction: () => ({
        type: 'true-false',
        response: true,
        correct: true,
      }),
    });
    engine.registerQuestion({
      id: 'b',
      weight: 1,
      checkAnswer: () => false,
      interaction: () => ({
        type: 'true-false',
        response: false,
        correct: true,
      }),
    });
    engine.setAnswer(0, true);
    engine.setAnswer(1, false);
    engine.submit();
    expect(completeScore(events)).toBe(75);
  });

  it('weight=1 (default) score matches unweighted-mean output byte-for-byte', () => {
    // Default config produces the same score the pre-weighting unweighted formula did.
    const { engine, events } = makeEngine();
    engine.registerQuestion(tfQuestion('a', true, true)); // correct
    engine.registerQuestion(tfQuestion('b', false, true)); // wrong
    engine.registerQuestion(tfQuestion('c', true, true)); // correct
    engine.setAnswer(0, true);
    engine.setAnswer(1, false);
    engine.setAnswer(2, true);
    engine.submit();
    expect(completeScore(events)).toBe(67); // 2/3 → Math.round(66.67)
  });

  it('fires question-answered, before-submit, complete and retry events in order', () => {
    const { engine, events } = makeEngine();
    engine.registerQuestion(tfQuestion('a', true, true));
    engine.setAnswer(0, true);
    engine.submit();
    engine.retry();
    expect(events.map((e) => e.name)).toEqual([
      'tessera-quiz-question-answered',
      'tessera-quiz-before-submit',
      'tessera-quiz-complete',
      'tessera-quiz-retry',
    ]);
  });

  it('rewrites a duplicate question id instead of registering it twice', () => {
    // The shell keys its {#each} on the id, and Svelte throws on a duplicate key
    // in production as well as dev, so a collision has to be made unique.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const { engine } = makeEngine();
      engine.registerQuestion(tfQuestion('dup', true, true));
      engine.registerQuestion(tfQuestion('dup', false, true));
      engine.registerQuestion(tfQuestion('dup', true, true));
      expect(engine.questions.map((q) => q.id)).toEqual([
        'dup',
        'dup-2',
        'dup-3',
      ]);
      const matched = warn.mock.calls.some((args) =>
        args.some(
          (a) => typeof a === 'string' && /duplicate question id/i.test(a),
        ),
      );
      expect(matched).toBe(true);
    } finally {
      warn.mockRestore();
    }
  });

  it('reports a rewritten duplicate id under its unique id', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const { engine, reports } = makeEngine();
      engine.registerQuestion(tfQuestion('dup', true, true));
      engine.registerQuestion(tfQuestion('dup', true, true));
      engine.setAnswer(0, true);
      engine.setAnswer(1, true);
      engine.submit();
      expect(reports.map((r) => r.id)).toEqual(['dup', 'dup-2']);
    } finally {
      warn.mockRestore();
    }
  });

  it('stays quiet about incomplete answers when no question registered', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const { engine } = makeEngine();
      engine.submit();
      const matched = warn.mock.calls.some((args) =>
        args.some(
          (a) => typeof a === 'string' && /nothing was scored/i.test(a),
        ),
      );
      expect(matched).toBe(false);
    } finally {
      warn.mockRestore();
    }
  });

  it('warns when submit() runs with a null host element (silent LMS dropout)', () => {
    // A null host means dispatch() returns false: no LMS bridge listener exists,
    // so the score would never be persisted. The engine warns instead of failing
    // silently. (In the wrapper, a null host element produces this same false.)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const { engine, events, reports } = makeEngine(
        { graded: true },
        { hostNull: true },
      );
      engine.registerQuestion(tfQuestion('a', true, true));
      engine.setAnswer(0, true);
      engine.submit();
      expect(completes(events)).toHaveLength(0);
      // Nothing reaches the LMS: interactions without a score, a success status
      // or an attempt is a worse record than no record at all.
      expect(reports).toHaveLength(0);
      const matched = warn.mock.calls.some((args) =>
        args.some(
          (a) => typeof a === 'string' && /host element was null/i.test(a),
        ),
      );
      expect(matched).toBe(true);
    } finally {
      warn.mockRestore();
    }
  });
});

// ---- Wrapper-only tests: context wiring + lifecycle, where mounting is the point ----

interface HarnessRef {
  handle: UseQuizHandle | null;
  secondHandle?: UseQuizHandle | null;
  element: HTMLElement | null;
  events: Array<{ score: number }>;
  thrown: unknown;
}

function mountHarness(
  quizConfig: unknown,
  opts: {
    secondQuiz?: boolean;
    nullElement?: boolean;
    adapter?: unknown;
    quizState?: { attempts: number; score: number };
  } = {},
) {
  const ref: HarnessRef = {
    handle: null,
    element: null,
    events: [],
    thrown: null,
  };
  const target = document.createElement('div');
  const host = document.createElement('div');
  target.appendChild(host);
  document.body.appendChild(target);
  const component = mount(HarnessSvelte, {
    target,
    props: {
      ref,
      quizConfig,
      host,
      secondQuiz: opts.secondQuiz ?? false,
      nullElement: opts.nullElement ?? false,
      adapter: opts.adapter ?? null,
      quizState: opts.quizState ?? null,
    },
  });
  return { component, target, ref };
}

describe('useQuiz (Svelte wrapper)', () => {
  let mountings: ReturnType<typeof mountHarness>[] = [];

  beforeEach(() => {
    mountings = [];
    document.body.innerHTML = '';
  });

  afterEach(() => {
    for (const m of mountings) {
      try {
        unmount(m.component);
      } catch {}
    }
    document.body.innerHTML = '';
  });

  it('throws when called on a page with no quiz config', () => {
    const m = mountHarness(null);
    mountings.push(m);
    expect(m.ref.thrown).toBeInstanceOf(Error);
    expect((m.ref.thrown as Error).message).toMatch(/quiz config/i);
  });

  it('publishes tessera-quiz context that question widgets read via useQuestion', () => {
    // The context shape (registerQuestion / setAnswer / feedbackVisible / etc.)
    // is what built-ins depend on. The component-level integration is covered by
    // quiz-payload-integration.test.ts; this just checks the context handle is
    // published from inside useQuiz.
    const m = mountHarness({ graded: true });
    mountings.push(m);
    expect(m.ref.handle).not.toBeNull();
  });

  it('reads quiz config from tessera-page context — proves context flow holds for custom quiz.svelte', () => {
    // A custom quiz.svelte rendered through virtual:tessera-quiz must still
    // receive tessera-page from App.svelte. A non-default maxAttempts proves the
    // read goes through pageCtx, not a baked-in default.
    const m = mountHarness({ graded: true, maxAttempts: 1 });
    mountings.push(m);
    const q = m.ref.handle!;
    q.registerQuestion(tfQuestion('a', true, true));
    q.setAnswer(0, true);
    q.submit();
    expect(q.canRetry).toBe(false);
  });

  it('seeds the engine from the saved quiz state on tessera-page context', () => {
    const m = mountHarness(
      { graded: true, maxAttempts: 2 },
      { quizState: { attempts: 2, score: 60 } },
    );
    mountings.push(m);
    const q = m.ref.handle!;
    expect(q.state).toBe('submitted');
    expect(q.score).toBe(60);
    expect(q.canRetry).toBe(false);
  });

  it('warns in dev when a second useQuiz registers on the same page', () => {
    // The runtime keys quiz scores by pageIndex — a second quiz on the same page
    // silently overwrites the first. Surface that as a dev warning.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const m = mountHarness({ graded: true }, { secondQuiz: true });
      mountings.push(m);
      expect(m.ref.handle).not.toBeNull();
      expect(m.ref.secondHandle).not.toBeNull();
      const matched = warn.mock.calls.some((args) =>
        args.some((a) => typeof a === 'string' && /second quiz/i.test(a)),
      );
      expect(matched).toBe(true);
    } finally {
      warn.mockRestore();
    }
  });

  it('warns when submit() unmounts without ever firing (custom shell forgot to call it)', async () => {
    // A custom quiz shell that forgets to route through useQuiz().submit() never
    // reaches the LMS adapter. Catch it on unmount so the bug stays local to dev.
    // Exercised via the exported helper — the onDestroy call site is covered by
    // the e2e custom-quiz suite.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const { __warnUnsubmittedQuiz } =
        await import('../src/runtime/hooks.svelte.js');
      __warnUnsubmittedQuiz({
        questionsCount: 2,
        answersCount: 1,
        submitCalled: false,
      });
      const matched = warn.mock.calls.some((args) =>
        args.some(
          (a) =>
            typeof a === 'string' && /submit\(\) was never called/i.test(a),
        ),
      );
      expect(matched).toBe(true);

      // Inverse: nothing answered, or already submitted → no warning.
      warn.mockClear();
      __warnUnsubmittedQuiz({
        questionsCount: 2,
        answersCount: 0,
        submitCalled: false,
      });
      __warnUnsubmittedQuiz({
        questionsCount: 2,
        answersCount: 1,
        submitCalled: true,
      });
      expect(warn.mock.calls.length).toBe(0);
    } finally {
      warn.mockRestore();
    }
  });

  it('warns when a quiz mounts with no registered questions', async () => {
    // A quiz page wrapped by a shell but with no useQuestion() widgets has nothing
    // to score or report. Exercised directly via the exported helper for the same
    // onMount timing reasons as the unmount warning above.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const { __warnEmptyQuiz } =
        await import('../src/runtime/hooks.svelte.js');
      __warnEmptyQuiz(0);
      const matched = warn.mock.calls.some((args) =>
        args.some(
          (a) => typeof a === 'string' && /no registered questions/i.test(a),
        ),
      );
      expect(matched).toBe(true);

      // Inverse: any registered question → no warning.
      warn.mockClear();
      __warnEmptyQuiz(1);
      expect(warn.mock.calls.length).toBe(0);
    } finally {
      warn.mockRestore();
    }
  });
});
