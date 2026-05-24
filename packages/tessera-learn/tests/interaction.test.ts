import { describe, it, expect } from 'vitest';
import { isCorrect } from '../src/runtime/interaction.js';

describe('isCorrect', () => {
  describe('choice', () => {
    it('matches on set equality (order-independent)', () => {
      expect(
        isCorrect({
          type: 'choice',
          response: ['a', 'b'],
          correct: ['b', 'a'],
        }),
      ).toBe(true);
    });

    it('fails when responses differ', () => {
      expect(
        isCorrect({ type: 'choice', response: ['a'], correct: ['a', 'b'] }),
      ).toBe(false);
      expect(
        isCorrect({
          type: 'choice',
          response: ['a', 'c'],
          correct: ['a', 'b'],
        }),
      ).toBe(false);
    });

    it('returns null when correct is undefined', () => {
      expect(isCorrect({ type: 'choice', response: ['a'] })).toBeNull();
    });
  });

  describe('true-false', () => {
    it('matches on equality', () => {
      expect(
        isCorrect({ type: 'true-false', response: true, correct: true }),
      ).toBe(true);
      expect(
        isCorrect({ type: 'true-false', response: false, correct: true }),
      ).toBe(false);
    });

    it('returns null when correct is undefined', () => {
      expect(isCorrect({ type: 'true-false', response: true })).toBeNull();
    });
  });

  describe('fill-in', () => {
    it('is case-insensitive by default', () => {
      expect(
        isCorrect({ type: 'fill-in', response: 'Paris', correct: ['paris'] }),
      ).toBe(true);
    });

    it('honors caseMatters when set', () => {
      expect(
        isCorrect({
          type: 'fill-in',
          response: 'paris',
          correct: ['Paris'],
          caseMatters: true,
        }),
      ).toBe(false);
      expect(
        isCorrect({
          type: 'fill-in',
          response: 'Paris',
          correct: ['Paris'],
          caseMatters: true,
        }),
      ).toBe(true);
    });

    it('accepts any of multiple correct answers', () => {
      expect(
        isCorrect({
          type: 'fill-in',
          response: 'oxygen',
          correct: ['Oxygen', 'O2'],
        }),
      ).toBe(true);
    });

    it('returns null when correct is undefined', () => {
      expect(isCorrect({ type: 'fill-in', response: 'x' })).toBeNull();
    });
  });

  describe('long-fill-in', () => {
    it('same rules as fill-in', () => {
      expect(
        isCorrect({
          type: 'long-fill-in',
          response: 'Hello',
          correct: ['hello'],
        }),
      ).toBe(true);
      expect(
        isCorrect({
          type: 'long-fill-in',
          response: 'hello',
          correct: ['Hello'],
          caseMatters: true,
        }),
      ).toBe(false);
    });
  });

  describe('matching', () => {
    it('matches on pair-set equality', () => {
      expect(
        isCorrect({
          type: 'matching',
          response: [
            ['A', '1'],
            ['B', '2'],
          ],
          correct: [
            ['B', '2'],
            ['A', '1'],
          ],
        }),
      ).toBe(true);
    });

    it('fails when pairs differ', () => {
      expect(
        isCorrect({
          type: 'matching',
          response: [['A', '1']],
          correct: [['A', '2']],
        }),
      ).toBe(false);
    });

    it('returns null when correct is undefined', () => {
      expect(
        isCorrect({ type: 'matching', response: [['A', '1']] }),
      ).toBeNull();
    });
  });

  describe('sequencing', () => {
    it('requires exact order', () => {
      expect(
        isCorrect({
          type: 'sequencing',
          response: ['a', 'b', 'c'],
          correct: ['a', 'b', 'c'],
        }),
      ).toBe(true);
      expect(
        isCorrect({
          type: 'sequencing',
          response: ['b', 'a', 'c'],
          correct: ['a', 'b', 'c'],
        }),
      ).toBe(false);
    });

    it('fails on length mismatch', () => {
      expect(
        isCorrect({ type: 'sequencing', response: ['a'], correct: ['a', 'b'] }),
      ).toBe(false);
    });
  });

  describe('numeric', () => {
    it('matches when inside range', () => {
      expect(
        isCorrect({
          type: 'numeric',
          response: 5,
          correct: { min: 1, max: 10 },
        }),
      ).toBe(true);
    });

    it('fails when below min', () => {
      expect(
        isCorrect({
          type: 'numeric',
          response: 0,
          correct: { min: 1, max: 10 },
        }),
      ).toBe(false);
    });

    it('fails when above max', () => {
      expect(
        isCorrect({
          type: 'numeric',
          response: 11,
          correct: { min: 1, max: 10 },
        }),
      ).toBe(false);
    });

    it('open-ended min or max', () => {
      expect(
        isCorrect({ type: 'numeric', response: -100, correct: { max: 0 } }),
      ).toBe(true);
      expect(
        isCorrect({ type: 'numeric', response: 100, correct: { min: 0 } }),
      ).toBe(true);
    });
  });

  describe('likert', () => {
    it('matches on equality', () => {
      expect(
        isCorrect({ type: 'likert', response: 'agree', correct: 'agree' }),
      ).toBe(true);
      expect(
        isCorrect({ type: 'likert', response: 'disagree', correct: 'agree' }),
      ).toBe(false);
    });
  });

  describe('performance', () => {
    it('matches on step-set equality regardless of order', () => {
      expect(
        isCorrect({
          type: 'performance',
          response: [
            ['step-a', 1],
            ['step-b', 'x'],
          ],
          correct: [
            ['step-b', 'x'],
            ['step-a', 1],
          ],
        }),
      ).toBe(true);
    });

    it('fails on wrong step value', () => {
      expect(
        isCorrect({
          type: 'performance',
          response: [['step-a', 2]],
          correct: [['step-a', 1]],
        }),
      ).toBe(false);
    });
  });

  describe('other', () => {
    it('matches on string equality', () => {
      expect(
        isCorrect({ type: 'other', response: 'foo', correct: 'foo' }),
      ).toBe(true);
      expect(
        isCorrect({ type: 'other', response: 'foo', correct: 'bar' }),
      ).toBe(false);
    });

    it('returns null when correct is undefined', () => {
      expect(isCorrect({ type: 'other', response: 'foo' })).toBeNull();
    });
  });
});
