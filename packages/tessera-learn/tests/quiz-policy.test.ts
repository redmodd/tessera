import { describe, it, expect, vi } from 'vitest';
import {
  resolveFeedbackMode,
  resolveRetryStrategy,
  resolveCanSubmit,
  resolveScore,
  type QuizQuestionResult,
} from '../src/runtime/quiz-policy.js';
import type { Interaction } from '../src/runtime/interaction.js';

const tfInteraction = (response: boolean): Interaction => ({
  type: 'true-false',
  response,
  correct: true,
});

function results(values: Array<{ correct: boolean; weight?: number }>): QuizQuestionResult[] {
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
    expect(resolveFeedbackMode(null)({ ...baseState, reviewing: true })).toBe(true);
  });

  it('predicate forms receive the full visibility state', () => {
    const custom = vi.fn().mockReturnValue(false);
    const fn = resolveFeedbackMode({ feedbackMode: custom });
    const state = { ...baseState, questionIndex: 2, attemptCount: 1 };
    expect(fn(state)).toBe(false);
    expect(custom).toHaveBeenCalledWith(state);
  });

  it('illustrative predicate — only show feedback after first wrong attempt', () => {
    const fn = resolveFeedbackMode({ feedbackMode: (s) => s.attemptCount > 0 && s.submitted });
    expect(fn({ ...baseState, submitted: true, attemptCount: 0 })).toBe(false);
    expect(fn({ ...baseState, submitted: true, attemptCount: 1 })).toBe(true);
  });
});

describe('resolveRetryStrategy', () => {
  it("'incorrect-only' enum returns the set of correct indices to lock", () => {
    const fn = resolveRetryStrategy({ retryMode: 'incorrect-only' });
    const locked = fn(results([{ correct: true }, { correct: false }, { correct: true }]));
    expect([...locked].sort()).toEqual([0, 2]);
  });

  it("'full' enum (default) returns an empty set", () => {
    const fn = resolveRetryStrategy({ retryMode: 'full' });
    expect(fn(results([{ correct: true }, { correct: false }])).size).toBe(0);
  });

  it('default config falls through to full reset', () => {
    expect(resolveRetryStrategy({})(results([{ correct: true }])).size).toBe(0);
    expect(resolveRetryStrategy(null)(results([{ correct: true }])).size).toBe(0);
  });

  it('predicate forms pass through verbatim', () => {
    const custom = vi.fn().mockReturnValue(new Set([1]));
    const fn = resolveRetryStrategy({ retryMode: custom });
    const arg = results([{ correct: true }, { correct: true }]);
    expect([...fn(arg)]).toEqual([1]);
    expect(custom).toHaveBeenCalledWith(arg);
  });

  it('throws in dev when predicate returns a non-Set (silent no-op otherwise)', () => {
    const fn = resolveRetryStrategy({
      retryMode: (() => [0, 1] as unknown as Set<number>),
    });
    expect(() => fn(results([{ correct: true }, { correct: false }]))).toThrow(/Set<number>/);
  });
});

describe('resolveCanSubmit', () => {
  it('default — every registered question must have an answer', () => {
    const fn = resolveCanSubmit({});
    expect(fn(0, 0)).toBe(false);
    expect(fn(2, 3)).toBe(false);
    expect(fn(3, 3)).toBe(true);
  });

  it('predicate forms pass through verbatim', () => {
    const custom = vi.fn((answered: number, _total: number) => answered > 0);
    const fn = resolveCanSubmit({ canSubmit: custom });
    expect(fn(1, 5)).toBe(true);
    expect(custom).toHaveBeenCalledWith(1, 5);
  });

  it('throws in dev when predicate returns a non-boolean', () => {
    const fn = resolveCanSubmit({
      canSubmit: ((answered: number) => answered) as unknown as (a: number, t: number) => boolean,
    });
    expect(() => fn(2, 5)).toThrow(/boolean/);
  });
});

describe('resolveScore', () => {
  it('default — unweighted-equivalent percentage when every weight is 1', () => {
    const fn = resolveScore({});
    expect(fn(results([{ correct: true }, { correct: true }, { correct: false }]))).toBe(67);
    expect(fn(results([{ correct: true }, { correct: true }]))).toBe(100);
    expect(fn(results([{ correct: false }, { correct: false }]))).toBe(0);
  });

  it('default — weighted-correct percentage when weights vary', () => {
    const fn = resolveScore({});
    // 3-point question correct, 1-point question wrong → 75
    expect(fn(results([{ correct: true, weight: 3 }, { correct: false, weight: 1 }]))).toBe(75);
  });

  it('non-positive weights collapse to weight=1', () => {
    const fn = resolveScore({});
    // weight 0 should not zero out the denominator
    expect(fn(results([{ correct: true, weight: 0 }, { correct: false, weight: 0 }]))).toBe(50);
  });

  it('empty results → 0', () => {
    expect(resolveScore({})([])).toBe(0);
  });

  it('predicate form passes through verbatim', () => {
    const fn = resolveScore({ score: () => 42 });
    expect(fn(results([{ correct: true }]))).toBe(42);
  });

  it('clamps and warns when predicate returns out-of-range value', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fn = resolveScore({ score: () => 999 });
    expect(fn(results([{ correct: true }]))).toBe(100);
    expect(warn).toHaveBeenCalled();

    const fn2 = resolveScore({ score: () => -50 });
    expect(fn2(results([{ correct: true }]))).toBe(0);
    warn.mockRestore();
  });

  it('throws in dev when predicate returns NaN/Infinity (silent LMS poisoning otherwise)', () => {
    expect(() => resolveScore({ score: () => NaN })(results([{ correct: true }]))).toThrow(/finite number/);
    expect(() => resolveScore({ score: () => Infinity })(results([{ correct: true }]))).toThrow(/finite number/);
    expect(() => resolveScore({ score: () => 'oops' as unknown as number })(results([{ correct: true }]))).toThrow();
  });
});
