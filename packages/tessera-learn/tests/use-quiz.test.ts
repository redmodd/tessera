// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount, unmount } from 'svelte';
import HarnessSvelte from './fixtures/use-quiz-harness.svelte';
import type { Interaction } from '../src/runtime/interaction.js';
// Tests drive the engine directly via the index-keyed internal surface.
// Authors of custom shells/widgets use the slim public UseQuizHandle.
import type { UseQuizInternalHandle as UseQuizHandle } from '../src/runtime/hooks.svelte.js';

// useQuiz needs a real component lifecycle (setContext, onDestroy, $state/$derived
// reactivity), so each test mounts a tiny harness component. The harness exposes
// the hook handle through `props.handleRef.current` and forwards a tessera-page
// context with the supplied quiz config.

interface HarnessRef {
  handle: UseQuizHandle | null;
  secondHandle?: UseQuizHandle | null;
  element: HTMLElement | null;
  events: Array<{ score: number; interactions: Array<{ id: string; interaction: Interaction; correct: boolean }> }>;
  thrown: unknown;
}

function mountHarness(
  quizConfig: unknown,
  opts: { secondQuiz?: boolean; nullElement?: boolean; adapter?: unknown } = {}
) {
  const ref: HarnessRef = { handle: null, element: null, events: [], thrown: null };
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
    },
  });
  return { component, target, ref };
}

function tfQuestion(id: string, response: boolean, correct: boolean) {
  return {
    id,
    checkAnswer: () => response === correct,
    interaction: (): Interaction => ({ type: 'true-false' as const, response, correct }),
  };
}

describe('useQuiz', () => {
  let mountings: ReturnType<typeof mountHarness>[] = [];

  beforeEach(() => {
    mountings = [];
    document.body.innerHTML = '';
  });

  afterEach(() => {
    for (const m of mountings) {
      try { unmount(m.component); } catch {}
    }
    document.body.innerHTML = '';
  });

  it('throws when called on a page with no quiz config', () => {
    const m = mountHarness(null);
    mountings.push(m);
    expect(m.ref.thrown).toBeInstanceOf(Error);
    expect((m.ref.thrown as Error).message).toMatch(/quiz config/i);
  });

  it('starts in answering state with no questions', () => {
    const m = mountHarness({ graded: true });
    mountings.push(m);
    const q = m.ref.handle!;
    expect(q.state).toBe('answering');
    expect(q.questions).toHaveLength(0);
    expect(q.canSubmit).toBe(false);
    expect(q.canRetry).toBe(false);
    expect(q.score).toBe(0);
    expect(q.attemptCount).toBe(0);
  });

  it('registerQuestion appends to quiz.questions in order, returning a handle per question', () => {
    const m = mountHarness({ graded: true });
    mountings.push(m);
    const q = m.ref.handle!;
    const a = q.registerQuestion(tfQuestion('a', true, true));
    const b = q.registerQuestion(tfQuestion('b', false, true));
    const c = q.registerQuestion(tfQuestion('c', true, true));
    expect(a.id).toBe('a');
    expect(b.id).toBe('b');
    expect(c.id).toBe('c');
    expect(q.questions).toHaveLength(3);
    expect(q.questions.map((qq) => qq.id)).toEqual(['a', 'b', 'c']);
  });

  it('canSubmit flips true once every registered question has an answer', () => {
    const m = mountHarness({ graded: true });
    mountings.push(m);
    const q = m.ref.handle!;
    q.registerQuestion(tfQuestion('a', true, true));
    q.registerQuestion(tfQuestion('b', true, true));
    expect(q.canSubmit).toBe(false);
    q.setAnswer(0, true);
    expect(q.canSubmit).toBe(false);
    q.setAnswer(1, true);
    expect(q.canSubmit).toBe(true);
  });

  it('submit() dispatches tessera-quiz-complete with score and per-question interactions', () => {
    const m = mountHarness({ graded: true });
    mountings.push(m);
    const q = m.ref.handle!;
    q.registerQuestion(tfQuestion('a', true, true));   // correct
    q.registerQuestion(tfQuestion('b', false, true));  // wrong
    q.setAnswer(0, true);
    q.setAnswer(1, false);

    q.submit();

    expect(m.ref.events).toHaveLength(1);
    const detail = m.ref.events[0];
    expect(detail.score).toBe(50);
    expect(detail.interactions).toEqual([
      { id: 'a', interaction: { type: 'true-false', response: true, correct: true }, correct: true },
      { id: 'b', interaction: { type: 'true-false', response: false, correct: true }, correct: false },
    ]);
  });

  it('reports each interaction to the adapter when the widget calls commit(), not on setAnswer', () => {
    const calls: Array<[string, boolean | null]> = [];
    const adapter = {
      reportInteraction(id: string, _i: Interaction, correct: boolean | null) {
        calls.push([id, correct]);
      },
    };
    const m = mountHarness({ graded: true }, { adapter });
    mountings.push(m);
    const q = m.ref.handle!;
    q.registerQuestion(tfQuestion('a', true, true));
    q.registerQuestion(tfQuestion('b', false, true));

    q.setAnswer(0, true);
    q.setAnswer(1, false);
    expect(calls).toHaveLength(0);

    q.questions[0].commit();
    expect(calls).toEqual([['a', true]]);

    q.questions[1].commit();
    expect(calls).toEqual([['a', true], ['b', false]]);

    q.submit();
    expect(calls).toHaveLength(2);
  });

  it('submit() reports any questions whose widget never called commit()', () => {
    const calls: string[] = [];
    const adapter = {
      reportInteraction(id: string) { calls.push(id); },
    };
    const m = mountHarness({ graded: true }, { adapter });
    mountings.push(m);
    const q = m.ref.handle!;
    q.registerQuestion(tfQuestion('a', true, true));
    q.registerQuestion(tfQuestion('b', false, true));
    q.setAnswer(0, true);
    q.setAnswer(1, false);
    q.submit();
    expect(calls).toEqual(['a', 'b']);
  });

  it('does not re-report a question whose answer was already committed before submit', () => {
    const calls: string[] = [];
    const adapter = {
      reportInteraction(id: string) { calls.push(id); },
    };
    const m = mountHarness({ graded: true }, { adapter });
    mountings.push(m);
    const q = m.ref.handle!;
    q.registerQuestion(tfQuestion('a', true, true));
    q.setAnswer(0, true);
    q.questions[0].commit();
    q.submit();
    expect(calls).toEqual(['a']);
  });

  it('re-reports when commit() is called after the answer changes', () => {
    const calls: Array<[string, boolean | null]> = [];
    const adapter = {
      reportInteraction(id: string, _i: Interaction, correct: boolean | null) {
        calls.push([id, correct]);
      },
    };
    const m = mountHarness({ graded: true }, { adapter });
    mountings.push(m);
    const q = m.ref.handle!;
    q.registerQuestion({
      id: 'a',
      checkAnswer: (answer) => answer === true,
      interaction: () => ({ type: 'true-false', response: q.getAnswer(0) === true, correct: true }),
    });
    q.setAnswer(0, false);
    q.questions[0].commit();
    q.setAnswer(0, true);
    q.questions[0].commit();
    expect(calls).toEqual([['a', false], ['a', true]]);
  });

  it('is a no-op when commit() is called twice with the same answer', () => {
    const calls: string[] = [];
    const adapter = {
      reportInteraction(id: string) { calls.push(id); },
    };
    const m = mountHarness({ graded: true }, { adapter });
    mountings.push(m);
    const q = m.ref.handle!;
    q.registerQuestion(tfQuestion('a', true, true));
    q.setAnswer(0, true);
    q.questions[0].commit();
    q.questions[0].commit();
    expect(calls).toEqual(['a']);
  });

  it('re-reports after retry() so a second attempt produces fresh statements', () => {
    const calls: Array<[string, boolean | null]> = [];
    const adapter = {
      reportInteraction(id: string, _i: Interaction, correct: boolean | null) {
        calls.push([id, correct]);
      },
    };
    const m = mountHarness({ graded: true }, { adapter });
    mountings.push(m);
    const q = m.ref.handle!;
    q.registerQuestion(tfQuestion('a', false, true));
    q.setAnswer(0, false);
    q.submit();
    expect(calls).toHaveLength(1);
    q.retry();
    q.setAnswer(0, false);
    q.submit();
    expect(calls).toHaveLength(2);
  });

  it('submit() is the only sanctioned dispatcher — calling twice does not double-fire', () => {
    const m = mountHarness({ graded: true });
    mountings.push(m);
    const q = m.ref.handle!;
    q.registerQuestion(tfQuestion('a', true, true));
    q.setAnswer(0, true);
    q.submit();
    q.submit();
    expect(m.ref.events).toHaveLength(1);
  });

  it('submit() refuses to fire until every question is answered', () => {
    const m = mountHarness({ graded: true });
    mountings.push(m);
    const q = m.ref.handle!;
    q.registerQuestion(tfQuestion('a', true, true));
    q.registerQuestion(tfQuestion('b', true, true));
    q.setAnswer(0, true);
    q.submit();
    expect(m.ref.events).toHaveLength(0);
    expect(q.state).toBe('answering');
  });

  it('after submit, questions[*].correct reports per-question pass/fail', () => {
    const m = mountHarness({ graded: true });
    mountings.push(m);
    const q = m.ref.handle!;
    q.registerQuestion(tfQuestion('a', true, true));
    q.registerQuestion(tfQuestion('b', false, true));
    q.setAnswer(0, true);
    q.setAnswer(1, false);
    q.submit();

    expect(q.questions[0].correct).toBe(true);
    expect(q.questions[1].correct).toBe(false);
    expect(q.questions[0].submitted).toBe(true);
    expect(q.state).toBe('submitted');
  });

  it('startReview / exitReview toggle the reviewing sub-state', () => {
    const m = mountHarness({ graded: true });
    mountings.push(m);
    const q = m.ref.handle!;
    q.registerQuestion(tfQuestion('a', true, true));
    q.setAnswer(0, true);
    q.submit();
    expect(q.state).toBe('submitted');
    q.startReview();
    expect(q.state).toBe('reviewing');
    q.exitReview();
    expect(q.state).toBe('submitted');
  });

  it('startReview is a no-op before submit', () => {
    const m = mountHarness({ graded: true });
    mountings.push(m);
    const q = m.ref.handle!;
    q.registerQuestion(tfQuestion('a', true, true));
    q.setAnswer(0, true);
    q.startReview();
    expect(q.state).toBe('answering');
  });

  it('retry() resets state and bumps attemptCount', () => {
    const m = mountHarness({ graded: true });
    mountings.push(m);
    const q = m.ref.handle!;
    q.registerQuestion(tfQuestion('a', true, true));
    q.setAnswer(0, true);
    q.submit();
    expect(q.attemptCount).toBe(1);
    expect(q.canRetry).toBe(true);
    q.retry();
    expect(q.state).toBe('answering');
    expect(q.score).toBe(0);
    expect(q.getAnswer(0)).toBeUndefined();
  });

  it('canRetry respects maxAttempts', () => {
    const m = mountHarness({ graded: true, maxAttempts: 2 });
    mountings.push(m);
    const q = m.ref.handle!;
    q.registerQuestion(tfQuestion('a', false, true));
    q.setAnswer(0, false);

    q.submit();
    expect(q.attemptCount).toBe(1);
    expect(q.canRetry).toBe(true);

    q.retry();
    q.setAnswer(0, false);
    q.submit();
    expect(q.attemptCount).toBe(2);
    expect(q.canRetry).toBe(false);
  });

  it('incorrect-only retry preserves correct answers and locks them', () => {
    const m = mountHarness({ graded: true, retryMode: 'incorrect-only' });
    mountings.push(m);
    const q = m.ref.handle!;

    let aResp = true;
    let bResp = false;
    q.registerQuestion({
      id: 'a',
      checkAnswer: () => aResp === true,
      interaction: () => ({ type: 'true-false', response: aResp, correct: true }),
    });
    q.registerQuestion({
      id: 'b',
      checkAnswer: () => bResp === true,
      interaction: () => ({ type: 'true-false', response: bResp, correct: true }),
    });
    q.setAnswer(0, true);
    q.setAnswer(1, false);
    q.submit();

    q.retry();
    expect(q.isLockedCorrect(0)).toBe(true);
    expect(q.isLockedCorrect(1)).toBe(false);
    expect(q.getAnswer(0)).toBe(true);
    expect(q.getAnswer(1)).toBeUndefined();
  });

  it('full retry (default) clears every answer and resets every question', () => {
    const m = mountHarness({ graded: true });
    mountings.push(m);
    const q = m.ref.handle!;
    const resetA = vi.fn();
    const resetB = vi.fn();
    q.registerQuestion({ ...tfQuestion('a', true, true), reset: resetA });
    q.registerQuestion({ ...tfQuestion('b', true, true), reset: resetB });
    q.setAnswer(0, true);
    q.setAnswer(1, true);
    q.submit();

    q.retry();
    expect(resetA).toHaveBeenCalledTimes(1);
    expect(resetB).toHaveBeenCalledTimes(1);
    expect(q.getAnswer(0)).toBeUndefined();
    expect(q.getAnswer(1)).toBeUndefined();
  });

  it('revealFeedback flips feedbackVisible for a question', () => {
    const m = mountHarness({ graded: true, feedbackMode: 'immediate' });
    mountings.push(m);
    const q = m.ref.handle!;
    const a = q.registerQuestion(tfQuestion('a', true, true));
    expect(a.feedbackVisible).toBe(false);
    expect(q.feedbackVisible(0)).toBe(false);
    q.revealFeedback(a);
    expect(a.feedbackVisible).toBe(true);
    expect(q.feedbackVisible(0)).toBe(true);
  });

  it('setRender stores the snippet returned via getRender', () => {
    const m = mountHarness({ graded: true });
    mountings.push(m);
    const q = m.ref.handle!;
    q.registerQuestion(tfQuestion('a', true, true));
    const snippet = () => 'rendered';
    q.setRender(0, snippet);
    expect(q.getRender(0)).toBe(snippet);
  });

  it('event payload omits questions that do not expose interaction()', () => {
    const m = mountHarness({ graded: true });
    mountings.push(m);
    const q = m.ref.handle!;
    q.registerQuestion(tfQuestion('a', true, true));
    q.registerQuestion({
      id: 'b',
      checkAnswer: () => true,
      interaction: undefined as unknown as () => Interaction,
    });
    q.setAnswer(0, true);
    q.setAnswer(1, true);
    q.submit();

    expect(m.ref.events[0].interactions).toEqual([
      { id: 'a', interaction: { type: 'true-false', response: true, correct: true }, correct: true },
    ]);
  });

  it('weighted score — Σ(w·correct)/Σ(w)*100 with mixed weights', () => {
    const m = mountHarness({ graded: true });
    mountings.push(m);
    const q = m.ref.handle!;
    // 3-point question correct, 1-point question wrong → 75
    q.registerQuestion({
      id: 'a',
      weight: 3,
      checkAnswer: () => true,
      interaction: () => ({ type: 'true-false', response: true, correct: true }),
    });
    q.registerQuestion({
      id: 'b',
      weight: 1,
      checkAnswer: () => false,
      interaction: () => ({ type: 'true-false', response: false, correct: true }),
    });
    q.setAnswer(0, true);
    q.setAnswer(1, false);
    q.submit();
    expect(m.ref.events[0].score).toBe(75);
  });

  it('weight=1 (default) score matches unweighted-mean output byte-for-byte', () => {
    // Phase 5 Task 4 regression gate — default config produces the same score
    // the pre-Phase-5 unweighted formula did.
    const m = mountHarness({ graded: true });
    mountings.push(m);
    const q = m.ref.handle!;
    q.registerQuestion(tfQuestion('a', true, true));   // correct
    q.registerQuestion(tfQuestion('b', false, true));  // wrong
    q.registerQuestion(tfQuestion('c', true, true));   // correct
    q.setAnswer(0, true);
    q.setAnswer(1, false);
    q.setAnswer(2, true);
    q.submit();
    expect(m.ref.events[0].score).toBe(67); // 2/3 → Math.round(66.67)
  });

  it('Task 5 — fires question-answered, before-submit and retry DOM events alongside complete', () => {
    const m = mountHarness({ graded: true });
    mountings.push(m);
    const q = m.ref.handle!;
    const events: string[] = [];
    for (const name of [
      'tessera-quiz-question-answered',
      'tessera-quiz-before-submit',
      'tessera-quiz-retry',
    ]) {
      m.ref.element!.addEventListener(name, () => events.push(name));
    }
    q.registerQuestion(tfQuestion('a', true, true));
    q.setAnswer(0, true);
    q.submit();
    q.retry();
    expect(events).toEqual([
      'tessera-quiz-question-answered',
      'tessera-quiz-before-submit',
      'tessera-quiz-retry',
    ]);
  });

  it('publishes tessera-quiz context that question widgets read via useQuestion', () => {
    // The context shape (registerQuestion / setAnswer / feedbackVisible / etc.)
    // is what existing built-ins depend on. The component-level integration is
    // covered separately by quiz-payload-integration.test.ts; this test just
    // checks the context handle is published from inside useQuiz.
    const m = mountHarness({ graded: true });
    mountings.push(m);
    expect(m.ref.handle).not.toBeNull();
  });

  it('reads quiz config from tessera-page context — proves context flow holds for custom quiz.svelte', () => {
    // Risk #7 from the Phase 5 spec: a custom quiz.svelte rendered through
    // virtual:tessera-quiz must still receive tessera-page from App.svelte.
    // The hook reads pageCtx.quiz for every config dimension; a non-default
    // maxAttempts proves the read actually goes through pageCtx, not a baked-in
    // default. If pageCtx.quiz weren't readable, useQuiz would throw upstream
    // and the canRetry derivation wouldn't see this maxAttempts.
    const m = mountHarness({ graded: true, maxAttempts: 1 });
    mountings.push(m);
    const q = m.ref.handle!;
    q.registerQuestion(tfQuestion('a', true, true));
    q.setAnswer(0, true);
    q.submit();
    expect(q.canRetry).toBe(false);
  });

  it('warns when registerQuestion is called with a duplicate id', () => {
    // Duplicate ids overwrite per-question writes in cmi.interactions and produce
    // nonsense xAPI statements. Make the failure local.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const m = mountHarness({ graded: true });
      mountings.push(m);
      const q = m.ref.handle!;
      q.registerQuestion(tfQuestion('dup', true, true));
      q.registerQuestion(tfQuestion('dup', false, true));
      const matched = warn.mock.calls.some((args) =>
        args.some((a) => typeof a === 'string' && /duplicate question id/i.test(a))
      );
      expect(matched).toBe(true);
    } finally {
      warn.mockRestore();
    }
  });

  it('warns when submit() unmounts without ever firing (custom shell forgot to call it)', async () => {
    // The plan's load-bearing footgun: a custom quiz shell that forgets to
    // route through useQuiz().submit() never reaches the LMS adapter. Catch
    // it on unmount so the bug stays local to dev.
    //
    // We can't reliably observe Svelte 5 onDestroy firing from inside a
    // .svelte.ts hook under jsdom + vitest's `unmount`, so this test exercises
    // the warning code path directly via the exported `__warnUnsubmittedQuiz`
    // helper. The runtime call site (onDestroy → __warnUnsubmittedQuiz) is
    // exercised by the e2e custom-quiz suite, which actually unmounts pages.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const { __warnUnsubmittedQuiz } = await import('../src/runtime/hooks.svelte.js');
      __warnUnsubmittedQuiz({ questionsCount: 2, answersCount: 1, submitCalled: false });
      const matched = warn.mock.calls.some((args) =>
        args.some((a) => typeof a === 'string' && /submit\(\) was never called/i.test(a))
      );
      expect(matched).toBe(true);

      // Inverse: nothing answered → no warning (avoids false positives on
      // pages where the learner left without engaging).
      warn.mockClear();
      __warnUnsubmittedQuiz({ questionsCount: 2, answersCount: 0, submitCalled: false });
      __warnUnsubmittedQuiz({ questionsCount: 2, answersCount: 1, submitCalled: true });
      expect(warn.mock.calls.length).toBe(0);
    } finally {
      warn.mockRestore();
    }
  });

  it('warns when a quiz mounts with no registered questions', async () => {
    // A quiz page wrapped by a shell but with no useQuestion() widgets has
    // nothing to score or report. Exercised directly via the exported helper
    // for the same jsdom/onMount timing reasons as the unmount warning above.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const { __warnEmptyQuiz } = await import('../src/runtime/hooks.svelte.js');
      __warnEmptyQuiz(0);
      const matched = warn.mock.calls.some((args) =>
        args.some((a) => typeof a === 'string' && /no registered questions/i.test(a))
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

  it('warns when submit() runs with a null host element (silent LMS dropout)', () => {
    // Sister to the unmount warning. submitCalled flips true here so the
    // unmount path can't see the bug — the submit() warning must fire instead.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const m = mountHarness({ graded: true }, { nullElement: true });
      mountings.push(m);
      const q = m.ref.handle!;
      q.registerQuestion(tfQuestion('a', true, true));
      q.setAnswer(0, true);
      q.submit();
      // No event was dispatched (host is null) and no listener could have
      // received it either — that's the silent failure mode the warning catches.
      expect(m.ref.events.length).toBe(0);
      const matched = warn.mock.calls.some((args) =>
        args.some((a) => typeof a === 'string' && /host element was null/i.test(a))
      );
      expect(matched).toBe(true);
    } finally {
      warn.mockRestore();
    }
  });

  it('warns in dev when a second useQuiz registers on the same page', () => {
    // Today the runtime keys quiz scores by pageIndex — a second quiz on the
    // same page silently overwrites the first. Surface that as a dev warning
    // so authors notice before shipping.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const m = mountHarness({ graded: true }, { secondQuiz: true });
      mountings.push(m);
      expect(m.ref.handle).not.toBeNull();
      expect(m.ref.secondHandle).not.toBeNull();
      const matched = warn.mock.calls.some((args) =>
        args.some((a) => typeof a === 'string' && /second quiz/i.test(a))
      );
      expect(matched).toBe(true);
    } finally {
      warn.mockRestore();
    }
  });
});
