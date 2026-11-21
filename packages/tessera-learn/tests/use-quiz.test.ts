// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import type { Interaction } from '../src/runtime/interaction.js';
import type { QuizConfig } from '../src/runtime/types.js';
import { QuizEngine } from '../src/runtime/quiz-engine.svelte.js';
import { flush } from './helpers.js';
import { mountHarness } from './helpers/mount.js';

// Most of useQuiz's behavior is now the framework-free QuizEngine, constructed
// directly with `onComplete` / `report` test doubles — no mount, no jsdom, no
// harness. Only the handful of tests whose subject *is* the Svelte wrapper
// (context wiring, the config throw, lifecycle warnings) still mount.

interface EngineProbe {
  engine: QuizEngine;
  /** Every dispatched host event, in order. */
  events: Array<{ name: string; detail: unknown }>;
  /** Every score handed to progress, in order. */
  completed: number[];
  /** The responses handed to progress with each score, in order. */
  responses: Array<Record<string, unknown>>;
  /** The attempt's question ids handed to progress with each score, in order. */
  questionIds: Array<string[] | undefined>;
  /** Every fresh draw handed to progress, in order. */
  draws: (readonly string[])[];
  /** Every interaction reported to the (injected) adapter, in order. */
  reports: Array<{
    id: string;
    interaction: Interaction;
    correct: boolean | null;
    text?: string;
  }>;
}

function makeEngine(
  quizConfig: Partial<QuizConfig> = { graded: true },
  opts: {
    passingScore?: number;
    noElement?: boolean;
    restore?: {
      attempts: number;
      score: number;
      unscored?: boolean;
      responses?: Record<string, unknown>;
      questionIds?: string[];
      drawn?: string[];
    };
  } = {},
): EngineProbe {
  const events: EngineProbe['events'] = [];
  const reports: EngineProbe['reports'] = [];
  const completed: number[] = [];
  const responses: EngineProbe['responses'] = [];
  const questionIds: EngineProbe['questionIds'] = [];
  const draws: (readonly string[])[] = [];
  const engine = new QuizEngine({
    quizConfig: quizConfig as QuizConfig,
    passingScore: () => opts.passingScore ?? 70,
    report: (id, interaction, correct, text) =>
      reports.push({ id, interaction, correct, text }),
    onComplete: (score, answered, _scored, ids) => {
      completed.push(score);
      responses.push(Object.fromEntries(answered));
      questionIds.push(ids);
    },
    onDraw: (ids) => draws.push(ids),
    notify: opts.noElement
      ? undefined
      : (name, detail) => events.push({ name, detail }),
    restore: opts.restore && {
      ...opts.restore,
      responses: new Map(Object.entries(opts.restore.responses ?? {})),
    },
  });
  return { engine, events, reports, completed, responses, questionIds, draws };
}

function completeScore(events: EngineProbe['events']): number | undefined {
  const e = events.find((ev) => ev.name === 'tessera-quiz-complete');
  return e ? (e.detail as { score: number }).score : undefined;
}

function completes(events: EngineProbe['events']) {
  return events.filter((e) => e.name === 'tessera-quiz-complete');
}

/** A survey question: no `correct`, so it has nothing to score. */
function surveyQuestion(id: string) {
  return {
    id,
    checkAnswer: () => null,
    interaction: (): Interaction => ({ type: 'long-fill-in', response: 'x' }),
  };
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
  it("leaves submit and retry to the quiz and resets only the question's widget", () => {
    const { engine, reports } = makeEngine();
    const reset = vi.fn();
    const q = engine.registerQuestion({
      ...tfQuestion('a', true, true),
      reset,
    });
    engine.setAnswer(0, true);

    expect(q.mode).toBe('quiz');
    expect(q.canRetry).toBe(false);
    q.submit();
    expect(q.submitted).toBe(false);
    expect(reports).toHaveLength(0);

    engine.submit();
    q.retry();
    q.reset();
    expect(q.retryCount).toBe(0);
    expect(reset).toHaveBeenCalledTimes(1);
    expect(engine.state).toBe('submitted');
  });

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
    // CourseSession applies an LMS-supplied masteryScore to the passing score
    // *after* useQuiz() may already have mounted the quiz. The engine must read
    // the threshold on each access, not snapshot it at construction, or the
    // quiz's pass/fail UI diverges from the LMS success status.
    let passingScore = 70;
    const engine = new QuizEngine({
      quizConfig: { graded: true } as QuizConfig,
      passingScore: () => passingScore,
      report: () => {},
      onComplete: () => {},
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

  it('reports the question text the widget gives', () => {
    const { engine, reports } = makeEngine();
    engine.registerQuestion({
      ...tfQuestion('a', true, true),
      text: () => 'Is the sky blue?',
    });
    engine.setAnswer(0, true);
    engine.submit();
    expect(reports[0].text).toBe('Is the sky blue?');
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

  it('exposes feedbackMode and maxAttempts with their config defaults', () => {
    const defaults = makeEngine({ graded: true }).engine;
    expect(defaults.feedbackMode).toBe('review');
    expect(defaults.maxAttempts).toBe(Infinity);

    const set = makeEngine({ feedbackMode: 'never', maxAttempts: 2 }).engine;
    expect(set.feedbackMode).toBe('never');
    expect(set.maxAttempts).toBe(2);
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

    describe('with saved answers', () => {
      // A widget holding one true/false answer, as a mounted question would.
      function widget(id: string, correct: boolean, canRestore = true) {
        let response: boolean | undefined;
        return {
          id,
          checkAnswer: () => response === correct,
          interaction: (): Interaction | undefined =>
            response === undefined
              ? undefined
              : { type: 'true-false', response, correct },
          reset: () => {
            response = undefined;
          },
          restore: canRestore
            ? (saved: unknown) => {
                response = saved as boolean;
              }
            : undefined,
        };
      }

      it('hands progress the submitted responses', () => {
        const { engine, responses } = makeEngine();
        const restore = () => {};
        engine.registerQuestion({ ...tfQuestion('a', true, true), restore });
        engine.registerQuestion({ ...tfQuestion('b', false, true), restore });
        engine.setAnswer(0, true);
        engine.setAnswer(1, false);
        engine.submit();

        expect(responses).toEqual([{ a: true, b: false }]);
      });

      it.each([
        ['full', {}],
        ['incorrect-only', { a: true }],
      ] as const)(
        'with a question that cannot restore, a %s retry quiz hands progress %o',
        (retryMode, saved) => {
          const { engine, responses } = makeEngine({ graded: true, retryMode });
          engine.registerQuestion({
            ...tfQuestion('a', true, true),
            restore: () => {},
          });
          engine.registerQuestion(tfQuestion('b', true, true));
          engine.setAnswer(0, true);
          engine.setAnswer(1, true);
          engine.submit();

          expect(responses).toEqual([saved]);
        },
      );

      it('leaves a review when a question registers without its answer', () => {
        const { engine } = makeEngine(
          { graded: true },
          { restore: { attempts: 1, score: 100, responses: { a: true } } },
        );
        engine.registerQuestion(widget('a', true));
        engine.startReview();
        expect(engine.state).toBe('reviewing');

        engine.registerQuestion(widget('b', true));

        expect(engine.restored).toBe(true);
        expect(engine.state).toBe('submitted');
      });

      it('restores every answer, so the result can be reviewed', () => {
        const { engine } = makeEngine(
          { graded: true },
          {
            restore: {
              attempts: 1,
              score: 50,
              responses: { a: true, b: false },
            },
          },
        );
        engine.registerQuestion(widget('a', true));
        engine.registerQuestion(widget('b', true));

        expect(engine.state).toBe('submitted');
        expect(engine.restored).toBe(false);
        expect(engine.questions.map((q) => q.correct)).toEqual([true, false]);
        expect(engine.questions.map((q) => q.answer)).toEqual([true, false]);

        engine.startReview();
        expect(engine.state).toBe('reviewing');
        expect(engine.questions.every((q) => q.feedbackVisible)).toBe(true);
      });

      it('counts as submitted, so leaving the page raises no unsubmitted-quiz warning', () => {
        const { engine } = makeEngine(
          { graded: true },
          { restore: { attempts: 1, score: 100, responses: { a: true } } },
        );
        engine.registerQuestion(widget('a', true));

        expect(engine.stats).toEqual({
          registeredCount: 1,
          questionsCount: 1,
          answersCount: 1,
          submitCalled: true,
        });
      });

      it('reports nothing when a restored question commits', () => {
        const { engine, reports } = makeEngine(
          { graded: true },
          { restore: { attempts: 1, score: 100, responses: { a: true } } },
        );
        const q = engine.registerQuestion(widget('a', true));

        q.commit();

        expect(reports).toEqual([]);
      });

      it('holds what restore() returns as the answer', () => {
        const { engine } = makeEngine(
          { graded: true },
          { restore: { attempts: 1, score: 100, responses: { a: ['2'] } } },
        );
        const q = engine.registerQuestion({
          ...tfQuestion('a', true, true),
          restore: (response) => Number((response as string[])[0]),
        });

        expect(q.answer).toBe(2);
      });

      it.each([
        ['a question has no saved answer', { a: true }, true],
        ['a question has no restore()', { a: true, b: false }, false],
      ])('stays unreviewable when %s', (_, responses, canRestore) => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        const { engine } = makeEngine(
          { graded: true },
          { restore: { attempts: 1, score: 50, responses } },
        );
        engine.registerQuestion(widget('a', true));
        engine.registerQuestion(widget('b', true, canRestore));

        expect(engine.restored).toBe(true);
        expect(engine.questions.map((q) => q.correct)).toEqual([null, null]);
        engine.startReview();
        expect(engine.state).toBe('submitted');
      });

      it('stays unreviewable when a widget sets an answer the save did not bring back', () => {
        const { engine } = makeEngine(
          { graded: true },
          { restore: { attempts: 1, score: 100 } },
        );
        const q = engine.registerQuestion(widget('a', true));
        q.setAnswer(false);

        expect(engine.restored).toBe(true);
        expect(q.correct).toBe(null);
      });

      it('incorrect-only retry keeps the restored correct answers locked', () => {
        const { engine, responses } = makeEngine(
          { graded: true, retryMode: 'incorrect-only' },
          {
            restore: {
              attempts: 1,
              score: 50,
              responses: { a: true, b: false },
            },
          },
        );
        engine.registerQuestion(widget('a', true));
        const b = widget('b', true);
        engine.registerQuestion(b);

        engine.retry();
        expect(engine.questions.map((q) => q.isLockedCorrect)).toEqual([
          true,
          false,
        ]);
        expect(engine.canSubmit).toBe(false);

        b.restore!(true);
        engine.setAnswer(1, true);
        engine.submit();
        expect(engine.score).toBe(100);
        expect(responses).toEqual([{ a: true, b: true }]);
      });

      it('incorrect-only retry resets a correct question whose answer did not come back', () => {
        const { engine } = makeEngine(
          { graded: true, retryMode: 'incorrect-only' },
          { restore: { attempts: 1, score: 100 } },
        );
        const reset = vi.fn();
        const q = engine.registerQuestion({
          ...tfQuestion('a', true, true),
          reset,
        });

        engine.retry();

        expect(q.isLockedCorrect).toBe(false);
        expect(reset).toHaveBeenCalledOnce();
      });

      it('leaves a question that registers after a retry unanswered', () => {
        const { engine } = makeEngine(
          { graded: true },
          { restore: { attempts: 1, score: 100, responses: { a: true } } },
        );
        engine.retry();
        const q = engine.registerQuestion(widget('a', true));

        expect(q.answer).toBe(undefined);
        expect(engine.canSubmit).toBe(false);
      });
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
      checkAnswer: () => aResp,
      interaction: () => ({
        type: 'true-false',
        response: aResp,
        correct: true,
      }),
    });
    engine.registerQuestion({
      id: 'b',
      checkAnswer: () => bResp,
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

  it('revealFeedback resolves a proxied copy of a handle', () => {
    const { engine } = makeEngine({ graded: true, feedbackMode: 'immediate' });
    const a = engine.registerQuestion(tfQuestion('a', true, true));
    const proxied = new Proxy(a, {});
    engine.revealFeedback(proxied);
    expect(engine.feedbackVisible(0)).toBe(true);
  });

  it('revealFeedback ignores a handle from another engine with the same id', () => {
    const { engine } = makeEngine({ graded: true, feedbackMode: 'immediate' });
    const other = makeEngine({ graded: true, feedbackMode: 'immediate' });
    engine.registerQuestion(tfQuestion('a', true, true));
    const foreign = other.engine.registerQuestion(tfQuestion('a', true, true));
    engine.revealFeedback(foreign);
    expect(engine.feedbackVisible(0)).toBe(false);
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

  it('leaves a question with no correct answer out of the score and the result', () => {
    const { engine, events, reports } = makeEngine();
    const a = engine.registerQuestion(tfQuestion('a', true, true));
    const b = engine.registerQuestion({ ...surveyQuestion('b'), weight: 3 });
    engine.setAnswer(0, true);
    engine.setAnswer(1, 'x');
    engine.submit();

    expect(completeScore(events)).toBe(100);
    expect(engine.scored).toBe(true);
    expect(reports.map((r) => [r.id, r.correct])).toEqual([
      ['a', true],
      ['b', null],
    ]);
    expect(a.correct).toBe(true);
    expect(b.correct).toBeNull();
  });

  it('scores 100 when no question has a correct answer, warning when graded', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { engine, events } = makeEngine({ graded: true });
    engine.registerQuestion(surveyQuestion('a'));
    engine.setAnswer(0, 'x');
    engine.submit();
    expect(completes(events)[0].detail).toEqual({ score: 100, scored: false });
    expect(engine.scored).toBe(false);
    expect(warn).toHaveBeenCalledWith(
      expect.stringMatching(/graded, but no question has a `correct`/),
    );
  });

  it('keeps a scored best over a later unscored attempt', () => {
    let result: boolean | null = false;
    const { engine } = makeEngine({ graded: true, maxAttempts: 3 });
    engine.registerQuestion({
      ...surveyQuestion('a'),
      checkAnswer: () => result,
    });
    engine.setAnswer(0, 'x');
    engine.submit();
    expect(engine.bestScore).toBe(0);

    result = null;
    engine.retry();
    engine.setAnswer(0, 'x');
    engine.submit();
    expect(engine.score).toBe(100);
    expect(engine.bestScore).toBe(0);
  });

  it('replaces a restored unscored best with a scored attempt', () => {
    const { engine } = makeEngine(
      { graded: true, maxAttempts: 3 },
      { restore: { attempts: 1, score: 100, unscored: true } },
    );
    engine.registerQuestion(tfQuestion('a', true, false));
    engine.retry();
    engine.setAnswer(0, true);
    engine.submit();
    expect(engine.bestScore).toBe(0);
  });

  it('restores a result with nothing to score as unscored', () => {
    const { engine } = makeEngine(
      { graded: false },
      { restore: { attempts: 1, score: 100, unscored: true } },
    );
    expect(engine.scored).toBe(false);
  });

  it('does not warn about an ungraded quiz with no correct answer', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { engine } = makeEngine({ graded: false });
    engine.registerQuestion(surveyQuestion('a'));
    engine.setAnswer(0, 'x');
    engine.submit();
    expect(warn).not.toHaveBeenCalled();
  });

  it('incorrect-only retry keeps a no-correct answer unlocked and resets a wrong one', () => {
    const { engine } = makeEngine({
      graded: true,
      retryMode: 'incorrect-only',
    });
    const keptReset = vi.fn();
    const wrongReset = vi.fn();
    const kept = engine.registerQuestion({
      ...surveyQuestion('a'),
      reset: keptReset,
    });
    engine.registerQuestion({
      ...tfQuestion('b', false, true),
      reset: wrongReset,
    });
    engine.setAnswer(0, 'x');
    engine.setAnswer(1, false);
    engine.submit();

    engine.retry();
    expect(engine.getAnswer(0)).toBe('x');
    expect(kept.locked).toBe(false);
    expect(kept.isLockedCorrect).toBe(false);
    expect(keptReset).not.toHaveBeenCalled();
    expect(engine.getAnswer(1)).toBeUndefined();
    expect(wrongReset).toHaveBeenCalledTimes(1);
  });

  it('weight=1 (default) scores the unweighted mean to 2 decimal places', () => {
    const { engine, events } = makeEngine();
    engine.registerQuestion(tfQuestion('a', true, true)); // correct
    engine.registerQuestion(tfQuestion('b', false, true)); // wrong
    engine.registerQuestion(tfQuestion('c', true, true)); // correct
    engine.setAnswer(0, true);
    engine.setAnswer(1, false);
    engine.setAnswer(2, true);
    engine.submit();
    expect(completeScore(events)).toBe(66.67);
  });

  it('tessera-quiz-complete is the only event the engine dispatches', () => {
    const { engine, events } = makeEngine();
    engine.registerQuestion(tfQuestion('a', true, true));
    engine.setAnswer(0, true);
    engine.submit();
    engine.retry();
    expect(events.map((e) => e.name)).toEqual(['tessera-quiz-complete']);
  });

  it("feedbackMode 'review' (default) hides feedback until review", () => {
    const { engine } = makeEngine({ graded: true });
    engine.registerQuestion(tfQuestion('a', true, true));
    engine.setAnswer(0, true);
    engine.revealFeedbackByIndex(0);
    expect(engine.feedbackVisible(0)).toBe(false);
    engine.submit();
    engine.startReview();
    expect(engine.feedbackVisible(0)).toBe(true);
  });

  it("feedbackMode 'never' keeps feedback hidden even while reviewing", () => {
    const { engine } = makeEngine({ graded: true, feedbackMode: 'never' });
    engine.registerQuestion(tfQuestion('a', true, true));
    engine.setAnswer(0, true);
    engine.revealFeedbackByIndex(0);
    engine.submit();
    engine.startReview();
    expect(engine.feedbackVisible(0)).toBe(false);
  });

  it('commits on reveal with no element bound', () => {
    const { engine, reports } = makeEngine(
      { graded: true, feedbackMode: 'immediate' },
      { noElement: true },
    );
    engine.registerQuestion(tfQuestion('a', true, true));
    engine.setAnswer(0, true);
    engine.questions[0].commit();
    expect(reports.map((r) => r.id)).toEqual(['a']);
  });

  it('commits on reveal when a host element is present', () => {
    const { engine, reports } = makeEngine({
      graded: true,
      feedbackMode: 'immediate',
    });
    engine.registerQuestion(tfQuestion('a', true, true));
    engine.setAnswer(0, true);
    engine.questions[0].commit();
    expect(reports.map((r) => r.id)).toEqual(['a']);
  });

  it('rewrites a duplicate question id instead of registering it twice', () => {
    // The shell keys its {#each} on the id, and Svelte throws on a duplicate key
    // in production as well as dev, so a collision has to be made unique.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { engine } = makeEngine();
    engine.registerQuestion(tfQuestion('dup', true, true));
    engine.registerQuestion(tfQuestion('dup', false, true));
    engine.registerQuestion(tfQuestion('dup', true, true));
    expect(engine.questions.map((q) => q.id)).toEqual([
      'dup',
      'dup-2',
      'dup-3',
    ]);
    expect(warn).toHaveBeenCalledWith(
      expect.stringMatching(/duplicate question id/i),
    );
  });

  it('warns that a rewritten id took an id a later question owns', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { engine } = makeEngine();
    engine.registerQuestion(tfQuestion('dup', true, true));
    engine.registerQuestion(tfQuestion('dup', false, true));
    engine.registerQuestion(tfQuestion('dup-2', true, true));
    expect(engine.questions.map((q) => q.id)).toEqual([
      'dup',
      'dup-2',
      'dup-2-2',
    ]);
    expect(warn).toHaveBeenCalledWith(
      expect.stringMatching(/is already taken by an earlier/),
    );
  });

  it('reports a rewritten duplicate id under its unique id', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { engine, reports } = makeEngine();
    engine.registerQuestion(tfQuestion('dup', true, true));
    engine.registerQuestion(tfQuestion('dup', true, true));
    engine.setAnswer(0, true);
    engine.setAnswer(1, true);
    engine.submit();
    expect(reports.map((r) => r.id)).toEqual(['dup', 'dup-2']);
  });

  it('stays quiet about incomplete answers when no question registered', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { engine } = makeEngine();
    engine.submit();
    expect(warn).not.toHaveBeenCalledWith(
      expect.stringMatching(/nothing was scored/i),
    );
  });

  it('scores and reports with no element bound', () => {
    const { engine, reports, completed } = makeEngine(
      { graded: true },
      { noElement: true },
    );
    engine.registerQuestion(tfQuestion('a', true, true));
    engine.setAnswer(0, true);
    engine.submit();
    expect(completed).toEqual([100]);
    expect(reports.map((r) => r.id)).toEqual(['a']);
  });

  it('calls onComplete once per attempt', () => {
    const { engine, completed } = makeEngine({ graded: true, maxAttempts: 2 });
    engine.registerQuestion(tfQuestion('a', true, true));
    engine.setAnswer(0, true);
    engine.submit();
    engine.submit();
    engine.retry();
    engine.setAnswer(0, true);
    engine.submit();
    expect(completed).toEqual([100, 100]);
  });
});

describe('QuizEngine quiz bank', () => {
  /** A true/false question answered right, in pool `pool` when given. */
  function pooled(id: string, pool?: string, restore = true) {
    return {
      ...tfQuestion(id, true, true),
      pool,
      ...(restore ? { restore: (r: unknown) => r } : {}),
    };
  }

  function register(
    engine: QuizEngine,
    ...questions: ReturnType<typeof pooled>[]
  ) {
    return questions.map((q) => engine.registerQuestion(q));
  }

  const ids = (engine: QuizEngine) => engine.questions.map((q) => q.id);

  function answerAll(engine: QuizEngine) {
    for (const q of engine.questions) q.setAnswer(true);
  }

  it('draws the attempt once its questions register, in page order', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { engine } = makeEngine({ graded: true, draw: 2 });
    register(engine, pooled('a'), pooled('b'), pooled('c'), pooled('d'));
    expect(engine.questions).toEqual([]);

    vi.spyOn(Math, 'random').mockReturnValue(0);
    await Promise.resolve();

    expect(ids(engine)).toHaveLength(2);
    expect(ids(engine)).toEqual([...ids(engine)].sort());
    expect(warn).not.toHaveBeenCalled();
  });

  it('includes every question with no pool and draws the count from each named pool', async () => {
    const { engine } = makeEngine({
      graded: true,
      draw: { basics: 2, advanced: 1 },
    });
    register(
      engine,
      pooled('intro'),
      pooled('b1', 'basics'),
      pooled('b2', 'basics'),
      pooled('b3', 'basics'),
      pooled('a1', 'advanced'),
      pooled('a2', 'advanced'),
    );
    await Promise.resolve();

    const drawn = ids(engine);
    expect(drawn[0]).toBe('intro');
    expect(drawn.filter((id) => id.startsWith('b'))).toHaveLength(2);
    expect(drawn.filter((id) => id.startsWith('a'))).toHaveLength(1);
  });

  it('shuffles every question when shuffle is set without draw', async () => {
    const { engine } = makeEngine({ graded: true, shuffle: true });
    register(engine, pooled('a'), pooled('b'), pooled('c'));
    vi.spyOn(Math, 'random').mockReturnValue(0);
    await Promise.resolve();

    expect(ids(engine)).toEqual(['b', 'c', 'a']);
  });

  it('submits, scores, reports and saves only the attempt', async () => {
    const { engine, reports, responses, questionIds, completed } = makeEngine({
      graded: true,
      draw: 1,
    });
    const [a, b] = register(engine, pooled('a'), {
      ...pooled('b'),
      checkAnswer: () => false,
    });
    vi.spyOn(Math, 'random').mockReturnValue(0);
    await Promise.resolve();
    expect(ids(engine)).toEqual(['b']);
    expect(a.inAttempt).toBe(false);
    expect(b.inAttempt).toBe(true);

    a.commit();
    expect(reports).toEqual([]);
    expect(engine.canSubmit).toBe(false);
    b.setAnswer(false);
    expect(engine.canSubmit).toBe(true);
    engine.submit();

    expect(completed).toEqual([0]);
    expect(reports.map((r) => r.id)).toEqual(['b']);
    expect(Object.keys(responses[0])).toEqual(['b']);
    expect(questionIds).toEqual([['b']]);
  });

  it('saves no question ids when the quiz neither draws nor shuffles', async () => {
    const { engine, questionIds } = makeEngine({ graded: true });
    register(engine, pooled('a'));
    await Promise.resolve();
    answerAll(engine);
    engine.submit();

    expect(questionIds).toEqual([undefined]);
  });

  it("draws again on a full retry and keeps the attempt's order on an incorrect-only one", async () => {
    const random = vi.spyOn(Math, 'random');
    for (const [retryMode, expected] of [
      ['full', ['b', 'c']],
      ['incorrect-only', ['a', 'b']],
    ] as const) {
      const { engine } = makeEngine({ graded: true, draw: 2, retryMode });
      register(engine, pooled('a'), pooled('b'), pooled('c'));
      random.mockReturnValue(0.99);
      await Promise.resolve();
      expect(ids(engine)).toEqual(['a', 'b']);
      answerAll(engine);
      engine.submit();

      random.mockReturnValue(0);
      engine.retry();
      expect(ids(engine)).toEqual(expected);
    }
  });

  it('leaves a late question out of an incorrect-only retry that kept no answer', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const random = vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const { engine } = makeEngine({
      graded: true,
      draw: 2,
      retryMode: 'incorrect-only',
    });
    const wrong = (id: string) => ({
      ...pooled(id),
      ...tfQuestion(id, false, true),
    });
    register(engine, wrong('a'), wrong('b'), wrong('c'));
    await Promise.resolve();
    answerAll(engine);
    engine.submit();

    engine.retry();
    random.mockReturnValue(0);
    const [late] = register(engine, pooled('late'));
    await Promise.resolve();

    expect(ids(engine)).toEqual(['a', 'b']);
    expect(late.inAttempt).toBe(false);
    expect(warn).toHaveBeenCalledWith(
      expect.stringMatching(/"late" registered after the learner started/),
    );
  });

  describe('resumed', () => {
    const saved = {
      attempts: 1,
      score: 100,
      responses: { b: true, c: true },
      questionIds: ['c', 'b'],
    };

    it('sets the attempt from the saved ids at once, ready to review', () => {
      const { engine } = makeEngine(
        { graded: true, draw: 2, shuffle: true },
        { restore: saved },
      );
      const [a] = register(engine, pooled('a'), pooled('b'), pooled('c'));

      expect(ids(engine)).toEqual(['c', 'b']);
      expect(a.inAttempt).toBe(false);
      expect(a.answer).toBeUndefined();
      expect(engine.restored).toBe(false);
      engine.startReview();
      expect(engine.state).toBe('reviewing');
    });

    it('comes back restored when a saved question never registers, and draws again on retry', () => {
      const { engine } = makeEngine(
        { graded: true, draw: 2, retryMode: 'incorrect-only' },
        { restore: saved },
      );
      register(engine, pooled('a'), pooled('b'));

      expect(ids(engine)).toEqual(['b']);
      expect(engine.restored).toBe(true);

      engine.retry();
      expect(ids(engine)).toEqual(['a', 'b']);
      expect(engine.questions.every((q) => q.answer === undefined)).toBe(true);
    });

    it('keeps the attempt and locks correct answers on an incorrect-only retry when only an answer is missing', () => {
      const { engine } = makeEngine(
        { graded: true, draw: 2, retryMode: 'incorrect-only' },
        { restore: { ...saved, responses: { c: true } } },
      );
      const [, b, c] = register(
        engine,
        pooled('a'),
        pooled('b', undefined, false),
        pooled('c'),
      );
      expect(engine.restored).toBe(true);

      vi.spyOn(Math, 'random').mockReturnValue(0);
      engine.retry();
      expect(ids(engine)).toEqual(['c', 'b']);
      expect(c.isLockedCorrect).toBe(true);
      expect(b.answer).toBeUndefined();
    });

    it('comes back restored with no questions when the save kept no ids', () => {
      const { engine } = makeEngine(
        { graded: true, draw: 1 },
        { restore: { attempts: 1, score: 80 } },
      );
      register(engine, pooled('a'), pooled('b'));

      expect(engine.questions).toEqual([]);
      expect(engine.restored).toBe(true);
      expect(engine.score).toBe(80);

      engine.retry();
      expect(engine.questions).toHaveLength(1);
    });
  });

  it('draws again for a late question until the learner answers one', async () => {
    const { engine } = makeEngine({ graded: true, shuffle: true });
    register(engine, pooled('a'));
    await Promise.resolve();
    const [late] = register(engine, pooled('late'));

    await Promise.resolve();
    expect([...ids(engine)].sort()).toEqual(['a', 'late']);
    expect(late.inAttempt).toBe(true);
  });

  it('leaves out a question that registers after the learner answers, with a warning', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { engine } = makeEngine({ graded: true, shuffle: true });
    const [a] = register(engine, pooled('a'));
    await Promise.resolve();
    a.setAnswer(true);
    const [late] = register(engine, pooled('late'));

    await Promise.resolve();
    expect(ids(engine)).toEqual(['a']);
    expect(late.inAttempt).toBe(false);
    expect(warn).toHaveBeenCalledWith(
      expect.stringMatching(/"late" registered after the learner started/),
    );
  });

  it('does not blame the draw for a late question left out of a restored attempt', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { engine } = makeEngine(
      { graded: true, draw: 1 },
      { restore: { attempts: 1, score: 100, questionIds: ['a'] } },
    );
    register(engine, pooled('a'));
    const [late] = register(engine, pooled('late'));

    expect(late.inAttempt).toBe(false);
    expect(warn).not.toHaveBeenCalledWith(
      expect.stringMatching(/registered after the learner started/),
    );
  });

  describe('an unsubmitted draw', () => {
    it('keeps a fresh draw until it is submitted', async () => {
      const { engine, draws } = makeEngine({ graded: true, draw: 2 });
      register(engine, pooled('a'), pooled('b'), pooled('c'));
      await Promise.resolve();

      expect(draws).toEqual([ids(engine)]);
    });

    it('asks a saved draw again, in its order, without drawing', async () => {
      const { engine, draws } = makeEngine(
        { graded: true, draw: 2 },
        { restore: { attempts: 0, score: 0, drawn: ['c', 'a'] } },
      );
      register(engine, pooled('a'), pooled('b'), pooled('c'));
      await Promise.resolve();

      expect(ids(engine)).toEqual(['c', 'a']);
      expect(draws).toEqual([]);
    });

    it('draws again when a saved question no longer registers', async () => {
      const { engine, draws } = makeEngine(
        { graded: true, draw: 2 },
        { restore: { attempts: 0, score: 0, drawn: ['gone', 'a'] } },
      );
      register(engine, pooled('a'), pooled('b'), pooled('c'));
      await Promise.resolve();

      expect(ids(engine)).not.toContain('gone');
      expect(draws).toEqual([ids(engine)]);
    });

    it("asks a restored result's saved draw on Retry, then draws fresh after it is submitted", () => {
      const random = vi.spyOn(Math, 'random').mockReturnValue(0);
      const { engine, draws } = makeEngine(
        { graded: true, draw: 2 },
        {
          restore: {
            attempts: 1,
            score: 50,
            responses: { a: true, b: true },
            questionIds: ['a', 'b'],
            drawn: ['c', 'a'],
          },
        },
      );
      register(engine, pooled('a'), pooled('b'), pooled('c'));
      expect(ids(engine)).toEqual(['a', 'b']);

      engine.retry();
      expect(ids(engine)).toEqual(['c', 'a']);
      expect(draws).toEqual([]);

      answerAll(engine);
      engine.submit();
      random.mockReturnValue(0.99);
      engine.retry();
      expect(draws).toEqual([ids(engine)]);
    });

    it('saves the saved draw again once its last question registers late', async () => {
      const { engine, draws } = makeEngine(
        { graded: true, draw: 2 },
        { restore: { attempts: 0, score: 0, drawn: ['c', 'a'] } },
      );
      register(engine, pooled('a'), pooled('b'));
      await Promise.resolve();
      expect(ids(engine)).not.toEqual(['c', 'a']);

      register(engine, pooled('c'));
      await Promise.resolve();
      expect(ids(engine)).toEqual(['c', 'a']);
      expect(draws.at(-1)).toEqual(['c', 'a']);
    });

    it('draws again when questions a shell renders later leave the saved draw short', async () => {
      const { engine, draws } = makeEngine(
        { graded: true, draw: { bank: 2 } },
        { restore: { attempts: 0, score: 0, drawn: ['intro'] } },
      );
      register(engine, pooled('intro'));
      await Promise.resolve();
      expect(ids(engine)).toEqual(['intro']);

      register(
        engine,
        pooled('b1', 'bank'),
        pooled('b2', 'bank'),
        pooled('b3', 'bank'),
      );
      await Promise.resolve();
      expect(ids(engine)[0]).toBe('intro');
      expect(ids(engine)).toHaveLength(3);
      expect(draws).toEqual([ids(engine)]);
    });

    it('waits for the questions of a Retry pressed before any register', async () => {
      const { engine, draws } = makeEngine(
        { graded: true, draw: 2 },
        {
          restore: {
            attempts: 1,
            score: 50,
            questionIds: ['a', 'b'],
            drawn: ['c', 'a'],
          },
        },
      );
      engine.retry();
      expect(draws).toEqual([]);

      register(engine, pooled('a'), pooled('b'), pooled('c'));
      await Promise.resolve();
      expect(ids(engine)).toEqual(['c', 'a']);
      expect(draws).toEqual([]);
    });
  });

  it('warns about pools that cannot be drawn as configured once the learner answers', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { engine } = makeEngine({ graded: true, draw: { basics: 3 } });
    register(engine, pooled('b1', 'basics'), pooled('x', 'typo'));
    await Promise.resolve();
    expect(warn).not.toHaveBeenCalled();

    answerAll(engine);
    expect(ids(engine)).toEqual(['b1']);
    expect(warn).toHaveBeenCalledWith(
      expect.stringMatching(/asks for 3 from pool "basics", but only 1/),
    );
    expect(warn).toHaveBeenCalledWith(
      expect.stringMatching(/pool "typo", which quiz.draw does not list/),
    );
  });

  it('warns about a pool on a quiz that does not draw from pools', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { engine } = makeEngine({ graded: true });
    register(engine, pooled('x', 'basics'));

    answerAll(engine);
    expect(warn).toHaveBeenCalledWith(
      expect.stringMatching(/"x" names pool "basics", but quiz.draw is not/),
    );
  });

  it('warns about a pool that is not a string, which no draw count matches', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { engine } = makeEngine({ graded: true, draw: { '1': 1 } });
    register(engine, pooled('x', 1 as unknown as string));

    engine.setAnswer(0, true);
    expect(warn).toHaveBeenCalledWith(
      expect.stringMatching(/"x" pool must be a string, got number/),
    );
  });

  it('asks every question when draw is null, and flags its pools', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { engine } = makeEngine({
      graded: true,
      draw: null as unknown as QuizConfig['draw'],
    });
    register(engine, pooled('a'), pooled('x', 'basics'));

    answerAll(engine);
    expect(ids(engine)).toEqual(['a', 'x']);
    expect(engine.canSubmit).toBe(true);
    expect(warn).toHaveBeenCalledWith(
      expect.stringMatching(/"x" names pool "basics", but quiz.draw is not/),
    );
  });

  it('draws late questions in after an answer to a question outside the attempt', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { engine, draws } = makeEngine({ graded: true, draw: 2 });
    const handles = register(engine, pooled('a'), pooled('b'), pooled('c'));
    await Promise.resolve();
    handles.find((q) => !q.inAttempt)!.setAnswer(true);

    register(engine, pooled('d'));
    await Promise.resolve();
    expect(draws).toHaveLength(2);
    expect(warn).not.toHaveBeenCalledWith(
      expect.stringMatching(/after the learner started/),
    );
  });

  it('does not warn about a pool that fills up in a later update', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { engine } = makeEngine({ graded: true, draw: 2 });
    register(engine, pooled('a'));
    await Promise.resolve();
    register(engine, pooled('b'), pooled('c'));
    await Promise.resolve();

    answerAll(engine);
    expect(warn).not.toHaveBeenCalled();
  });

  it('puts every question in the attempt of a quiz that neither draws nor shuffles', () => {
    const { engine } = makeEngine({ graded: true });
    const [a] = register(engine, pooled('a'));
    expect(a.inAttempt).toBe(true);
    const [late] = register(engine, pooled('late'));
    expect(late.inAttempt).toBe(true);
    expect(ids(engine)).toEqual(['a', 'late']);
  });
});

// ---- Wrapper-only tests: context wiring + lifecycle, where mounting is the point ----

describe('useQuiz (Svelte wrapper)', () => {
  it('throws when called on a page with no quiz config', () => {
    const m = mountHarness(null);
    expect(m.ref.thrown).toBeInstanceOf(Error);
    expect((m.ref.thrown as Error).message).toMatch(/quiz config/i);
  });

  it('publishes the quiz context that question widgets read via useQuestion', () => {
    // Built-ins register through the context's registerQuestion. The
    // component-level integration is covered by
    // quiz-payload-integration.test.ts; this just checks the context handle is
    // published from inside useQuiz.
    const m = mountHarness({ graded: true });
    expect(m.ref.handle).not.toBeNull();
  });

  it('reads quiz config from the page context, so a custom quiz.svelte still gets it', () => {
    // A custom quiz.svelte rendered through virtual:tessera-quiz must still
    // receive the page context from App.svelte. A non-default maxAttempts proves the
    // read goes through pageCtx, not a baked-in default.
    const m = mountHarness({ graded: true, maxAttempts: 1 });
    const q = m.ref.handle!;
    q.registerQuestion(tfQuestion('a', true, true));
    q.setAnswer(0, true);
    q.submit();
    expect(q.canRetry).toBe(false);
  });

  it('seeds the engine from the saved quiz state on the page context', () => {
    const m = mountHarness(
      { graded: true, maxAttempts: 2 },
      { quizState: { attempts: 2, score: 60 } },
    );
    const q = m.ref.handle!;
    expect(q.state).toBe('submitted');
    expect(q.score).toBe(60);
    expect(q.canRetry).toBe(false);
  });

  it('records the submitted score against the page it renders on, with no element bound', () => {
    const scored: Array<[number, number]> = [];
    const navCtx = {
      nav: { currentPageIndex: 4 },
      progress: {
        quizCompleted: (pageIndex: number, score: number) =>
          scored.push([pageIndex, score]),
      },
    };
    const m = mountHarness(
      { graded: true },
      { nullElement: true, navCtx, pageIndex: 3 },
    );
    const q = m.ref.handle!;
    q.registerQuestion(tfQuestion('a', true, true));
    q.setAnswer(0, true);
    q.submit();
    expect(scored).toEqual([[3, 100]]);
    expect(m.ref.events).toHaveLength(0);
  });

  it('dispatches tessera-quiz-complete on the element when one is supplied', () => {
    const m = mountHarness({ graded: true });
    const q = m.ref.handle!;
    q.registerQuestion(tfQuestion('a', true, true));
    q.setAnswer(0, true);
    q.submit();
    expect(m.ref.events).toEqual([{ score: 100, scored: true }]);
  });

  it('warns in dev when a second useQuiz registers on the same page', () => {
    // The runtime keys quiz scores by pageIndex — a second quiz on the same page
    // silently overwrites the first. Surface that as a dev warning.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const m = mountHarness({ graded: true }, { secondQuiz: true });
    expect(m.ref.handle).not.toBeNull();
    expect(m.ref.secondHandle).not.toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/second quiz/i));
  });

  it('warns on unmount when answers were never submitted', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const m = mountHarness({ graded: true });
    const q = m.ref.handle!;
    q.registerQuestion(tfQuestion('a', true, true));
    q.setAnswer(0, true);
    await flush();
    m.unmount();
    expect(warn).toHaveBeenCalledWith(
      expect.stringMatching(/submit\(\) was never called/i),
    );
  });

  it.each([
    ['nothing was answered', () => {}],
    [
      'the quiz was submitted',
      (q: QuizEngine) => {
        q.setAnswer(0, true);
        q.submit();
      },
    ],
  ])('does not warn on unmount when %s', async (_, act) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const m = mountHarness({ graded: true });
    const q = m.ref.handle!;
    q.registerQuestion(tfQuestion('a', true, true));
    act(q);
    await flush();
    m.unmount();
    expect(warn).not.toHaveBeenCalledWith(
      expect.stringMatching(/submit\(\) was never called/i),
    );
  });

  it('warns when a quiz mounts with no registered questions', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mountHarness({ graded: true });
    await vi.waitFor(() =>
      expect(warn).toHaveBeenCalledWith(
        expect.stringMatching(/no registered questions/i),
      ),
    );
  });

  it('does not warn about an empty quiz once a question registers', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const m = mountHarness({ graded: true });
    m.ref.handle!.registerQuestion(tfQuestion('a', true, true));
    await flush();
    expect(warn).not.toHaveBeenCalledWith(
      expect.stringMatching(/no registered questions/i),
    );
  });
});
