import { describe, it, expect } from 'vitest';
import {
  resolveFeedbackMode,
  resolveRetryStrategy,
  type QuizQuestionResult,
} from '../src/runtime/quiz-policy.js';
import type { Interaction } from '../src/runtime/interaction.js';

const tfInteraction = (response: boolean): Interaction => ({
  type: 'true-false',
  response,
  correct: true,
});

function results(
  values: Array<{ correct: boolean; weight?: number }>,
): QuizQuestionResult[] {
  return values.map((v) => ({
    interaction: tfInteraction(v.correct),
    correct: v.correct,
    weight: v.weight ?? 1,
  }));
}

describe('resolveFeedbackMode', () => {
  const baseState = {
    questionIndex: 0,
    submitted: false,
    reviewing: false,
    hasAnswered: false,
    revealed: false,
    attemptCount: 0,
  };

  it("'immediate' enum desugars to: visible if revealed, or while reviewing", () => {
    const fn = resolveFeedbackMode({ feedbackMode: 'immediate' });
    expect(fn({ ...baseState })).toBe(false);
    expect(fn({ ...baseState, revealed: true })).toBe(true);
    expect(fn({ ...baseState, reviewing: true })).toBe(true);
  });

  it("'review' (default) — visible only while reviewing, never mid-quiz", () => {
    const fn = resolveFeedbackMode({ feedbackMode: 'review' });
    expect(fn({ ...baseState, revealed: true })).toBe(false);
    expect(fn({ ...baseState, reviewing: true })).toBe(true);

    const dflt = resolveFeedbackMode({});
    expect(dflt({ ...baseState, revealed: true })).toBe(false);
    expect(dflt({ ...baseState, reviewing: true })).toBe(true);
    expect(resolveFeedbackMode(null)({ ...baseState, reviewing: true })).toBe(
      true,
    );
  });
});

describe('resolveRetryStrategy', () => {
  it("'incorrect-only' enum returns the set of correct indices to lock", () => {
    const fn = resolveRetryStrategy({ retryMode: 'incorrect-only' });
    const locked = fn(
      results([{ correct: true }, { correct: false }, { correct: true }]),
    );
    expect([...locked].sort()).toEqual([0, 2]);
  });

  it("'full' enum (default) returns an empty set", () => {
    const fn = resolveRetryStrategy({ retryMode: 'full' });
    expect(fn(results([{ correct: true }, { correct: false }])).size).toBe(0);
  });

  it('default config falls through to full reset', () => {
    expect(resolveRetryStrategy({})(results([{ correct: true }])).size).toBe(0);
    expect(resolveRetryStrategy(null)(results([{ correct: true }])).size).toBe(
      0,
    );
  });
});
