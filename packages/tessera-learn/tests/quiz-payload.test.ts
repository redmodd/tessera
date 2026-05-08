import { describe, it, expect } from 'vitest';
import { buildQuizInteractions, type QuizQuestionApi } from '../src/components/quiz-payload.js';
import type { Interaction } from '../src/runtime/interaction.js';

describe('buildQuizInteractions', () => {
  it('emits one entry per registered question', () => {
    const ix1: Interaction = { type: 'choice', response: ['a'], correct: ['a'] };
    const ix2: Interaction = { type: 'true-false', response: false, correct: true };
    const questions: QuizQuestionApi[] = [
      { id: 'pick', checkAnswer: (a) => a === 'a', interaction: () => ix1 },
      { id: 'tf', checkAnswer: () => false, interaction: () => ix2 },
    ];
    const answers = new Map<number, unknown>([[0, 'a'], [1, false]]);
    expect(buildQuizInteractions(questions, answers)).toEqual([
      { id: 'pick', interaction: ix1, correct: true },
      { id: 'tf', interaction: ix2, correct: false },
    ]);
  });

  it('reports correct=false when checkAnswer rejects the answer', () => {
    const ix: Interaction = { type: 'fill-in', response: 'wrong', correct: ['right'] };
    const questions: QuizQuestionApi[] = [
      { id: 'f1', checkAnswer: (a) => a === 'right', interaction: () => ix },
    ];
    const result = buildQuizInteractions(questions, new Map([[0, 'wrong']]));
    expect(result[0].correct).toBe(false);
  });
});
