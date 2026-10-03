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
    expect(wrongQ.q.correct).toBe(false);
    expect(wrongQ.report).toHaveBeenCalledWith('q1', wrong, false);
    expect(wrongQ.markScore).toHaveBeenCalledWith('q1', 0, false, undefined);

    const scored = make({ response: () => wrong, score: () => 40 });
    scored.q.submit();
    expect(scored.markScore).toHaveBeenCalledWith('q1', 40, false, undefined);
  });

  it('reports correct=null when the interaction has no correct answer', () => {
    const likert: Interaction = { type: 'likert', response: 'agree' };
    const { q, report } = make({ response: () => likert });
    q.submit();

    expect(report).toHaveBeenCalledWith('q1', likert, null);
    expect(q.correct).toBe(null);
  });

  it('submit is a no-op while there is no response', () => {
    const { q, report, markScore } = make({
      response: () => undefined as unknown as Interaction,
    });
    q.submit();

    expect(q.submitted).toBe(false);
    expect(report).not.toHaveBeenCalled();
    expect(markScore).not.toHaveBeenCalled();
  });

  it('commit reports each distinct answer once and submit reports the final one', () => {
    let current = wrong;
    const { q, report, markScore } = make({ response: () => current });
    q.commit();
    q.commit();
    expect(report).toHaveBeenCalledTimes(1);

    current = right;
    q.submit();
    q.commit();

    expect(report).toHaveBeenCalledTimes(2);
    expect(report).toHaveBeenLastCalledWith('q1', right, true);
    expect(markScore).toHaveBeenCalledWith('q1', 100, false, undefined);
  });

  it('methods work unbound', () => {
    const { q, report } = make({ maxRetries: 1, response: () => wrong });
    const { setAnswer, submit, retry, reset, commit, setRender } = q;
    setAnswer('a');
    commit();
    submit();
    retry();
    reset();
    setRender();

    expect(report).toHaveBeenCalledTimes(1);
    expect(q.retryCount).toBe(1);
  });

  it('reset before a submit clears the answer without using a retry', () => {
    const userReset = vi.fn();
    const { q } = make({ maxRetries: 1, reset: userReset });
    q.setAnswer('a');
    q.reset();

    expect(q.answer).toBe(undefined);
    expect(q.retryCount).toBe(0);
    expect(userReset).toHaveBeenCalledTimes(1);
  });

  it('reset after a submit is a retry and honors maxRetries', () => {
    const { q, report } = make({ maxRetries: 1, response: () => wrong });
    q.submit();
    q.reset();
    expect(q.submitted).toBe(false);
    expect(q.retryCount).toBe(1);

    q.submit();
    q.reset();
    expect(q.submitted).toBe(true);
    expect(q.retryCount).toBe(1);
    expect(report).toHaveBeenCalledTimes(2);
  });

  it('retry before a submit is a no-op', () => {
    const userReset = vi.fn();
    const { q } = make({ maxRetries: 1, reset: userReset });
    q.retry();

    expect(q.retryCount).toBe(0);
    expect(q.canRetry).toBe(true);
    expect(userReset).not.toHaveBeenCalled();
  });

  it('retry resets, reports afresh and stops at maxRetries', () => {
    const userReset = vi.fn();
    const { q, report } = make({
      maxRetries: 1,
      reset: userReset,
      response: () => wrong,
    });
    expect(q.canRetry).toBe(true);
    q.submit();

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
    expect(userReset).toHaveBeenCalledTimes(1);
    expect(report).toHaveBeenCalledTimes(2);
  });

  it('cannot retry a correct answer', () => {
    const userReset = vi.fn();
    const { q } = make({ reset: userReset });
    q.submit();
    expect(q.canRetry).toBe(false);

    q.retry();
    q.reset();
    expect(q.submitted).toBe(true);
    expect(q.retryCount).toBe(0);
    expect(userReset).not.toHaveBeenCalled();
  });

  it('can retry an answer with no correct response', () => {
    const { q } = make({
      response: () => ({ type: 'likert', response: 'agree' }),
    });
    q.submit();
    expect(q.canRetry).toBe(true);

    q.retry();
    expect(q.submitted).toBe(false);
  });

  it('maxRetries: 0 means canRetry is false from the start', () => {
    const { q } = make({ maxRetries: 0 });
    expect(q.canRetry).toBe(false);
    q.submit();
    q.retry();

    expect(q.retryCount).toBe(0);
    expect(q.submitted).toBe(true);
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
    expect(q.mode).toBe('standalone');
    expect(q.render).toBe(undefined);
  });
});
