import { describe, it, expect, vi } from 'vitest';
import type { Interaction } from '../src/runtime/interaction.js';
import type { UseQuestionOptions } from '../src/runtime/hooks.svelte.js';
import { StandaloneQuestion } from '../src/runtime/standalone-question.svelte.js';

const right: Interaction = {
  type: 'true-false',
  response: true,
  correct: true,
};
const wrong: Interaction = {
  type: 'true-false',
  response: false,
  correct: true,
};

function make(opts: Partial<UseQuestionOptions> = {}) {
  const report = vi.fn();
  const markScore = vi.fn();
  const q = new StandaloneQuestion(
    { id: 'q1', response: () => right, ...opts },
    { report, markScore },
  );
  return { q, report, markScore };
}

describe('StandaloneQuestion', () => {
  it('submit reports once and marks the score', () => {
    const { q, report, markScore } = make({ graded: true, weight: 2 });
    q.submit();
    q.submit();

    expect(report).toHaveBeenCalledTimes(1);
    expect(report).toHaveBeenCalledWith('q1', right, true);
    expect(markScore).toHaveBeenCalledTimes(1);
    expect(markScore).toHaveBeenCalledWith('q1', 100, true, 2);
    expect(q.submitted).toBe(true);
    expect(q.correct).toBe(true);
    expect(q.answer).toBe(true);
    expect(q.locked).toBe(true);
    expect(q.feedbackVisible).toBe(true);
  });

  it('marks 0 for a wrong answer and honors a score override', () => {
    const wrongQ = make({ response: () => wrong });
    wrongQ.q.submit();
    expect(wrongQ.markScore).toHaveBeenCalledWith('q1', 0, false, undefined);

    const scored = make({ score: () => 40 });
    scored.q.submit();
    expect(scored.markScore).toHaveBeenCalledWith('q1', 40, false, undefined);
  });

  it('commit then submit does not double-report', () => {
    const { q, report, markScore } = make();
    q.commit();
    q.submit();

    expect(report).toHaveBeenCalledTimes(1);
    expect(markScore).toHaveBeenCalledTimes(1);
  });

  it('retry resets, reports afresh and stops at maxRetries', () => {
    const userReset = vi.fn();
    const { q, report } = make({ maxRetries: 1, reset: userReset });
    q.submit();
    expect(q.canRetry).toBe(true);

    q.retry();
    expect(q.submitted).toBe(false);
    expect(q.correct).toBe(null);
    expect(q.answer).toBe(undefined);
    expect(q.retryCount).toBe(1);
    expect(q.canRetry).toBe(false);
    expect(userReset).toHaveBeenCalledTimes(1);

    q.submit();
    q.retry();
    expect(q.retryCount).toBe(1);
    expect(q.submitted).toBe(true);
    expect(report).toHaveBeenCalledTimes(2);
  });

  it('isLockedCorrect only once correct and out of retries', () => {
    const capped = make({ maxRetries: 0 });
    expect(capped.q.isLockedCorrect).toBe(false);
    capped.q.submit();
    expect(capped.q.isLockedCorrect).toBe(true);

    const wrongQ = make({ maxRetries: 0, response: () => wrong });
    wrongQ.q.submit();
    expect(wrongQ.q.isLockedCorrect).toBe(false);

    const open = make();
    open.q.submit();
    expect(open.q.isLockedCorrect).toBe(false);
  });

  it('answerComplete needs an answer and defaults complete to true', () => {
    const { q } = make();
    expect(q.answerComplete).toBe(false);
    q.setAnswer('a');
    expect(q.answerComplete).toBe(true);

    let done = false;
    const gated = make({ complete: () => done }).q;
    gated.setAnswer('a');
    expect(gated.answerComplete).toBe(false);
    done = true;
    expect(gated.answerComplete).toBe(true);
  });

  it('is a standalone handle with no render', () => {
    const { q } = make();
    q.setRender();
    expect(q.mode).toBe('standalone');
    expect(q.render).toBe(undefined);
  });
});
