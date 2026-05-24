import type { Interaction } from '../../src/runtime/interaction.js';

/**
 * One concrete fixture for every SCORM 2004 4th Edition interaction type
 * (RTE §4.2.7). Pairs each shape with a known-correct learner response and a
 * matching `correct` pattern so `isCorrect()` returns `true`.
 *
 * Used by quiz-compliance.test.ts to prove the bridge between `useQuiz`
 * and the four adapters writes byte-identical LMS calls regardless of
 * orchestration changes.
 */
export interface ComplianceFixtureQuestion {
  id: string;
  /** Whether this answer should be marked correct in the bridge payload. */
  expectedCorrect: boolean;
  interaction: Interaction;
}

export const ALL_INTERACTION_FIXTURES: ComplianceFixtureQuestion[] = [
  {
    id: 'q-choice',
    expectedCorrect: true,
    interaction: { type: 'choice', response: ['1'], correct: ['1'] },
  },
  {
    id: 'q-true-false',
    expectedCorrect: true,
    interaction: { type: 'true-false', response: true, correct: true },
  },
  {
    id: 'q-fill-in',
    expectedCorrect: true,
    interaction: {
      type: 'fill-in',
      response: 'paris',
      correct: ['Paris'],
      caseMatters: false,
    },
  },
  {
    id: 'q-long-fill-in',
    expectedCorrect: false,
    interaction: {
      type: 'long-fill-in',
      response: 'a longer answer',
      correct: ['the canonical answer'],
      caseMatters: false,
    },
  },
  {
    id: 'q-matching',
    expectedCorrect: true,
    interaction: {
      type: 'matching',
      response: [
        ['a', 'A'],
        ['b', 'B'],
      ],
      correct: [
        ['a', 'A'],
        ['b', 'B'],
      ],
    },
  },
  {
    id: 'q-sequencing',
    expectedCorrect: true,
    interaction: {
      type: 'sequencing',
      response: ['1', '2', '3'],
      correct: ['1', '2', '3'],
    },
  },
  {
    id: 'q-numeric',
    expectedCorrect: true,
    interaction: {
      type: 'numeric',
      response: 42,
      correct: { min: 40, max: 45 },
    },
  },
  {
    id: 'q-likert',
    expectedCorrect: true,
    interaction: { type: 'likert', response: 'agree', correct: 'agree' },
  },
  {
    id: 'q-performance',
    expectedCorrect: true,
    interaction: {
      type: 'performance',
      response: [
        ['step1', 'do'],
        ['step2', 'next'],
      ],
      correct: [
        ['step1', 'do'],
        ['step2', 'next'],
      ],
    },
  },
  {
    id: 'q-other',
    expectedCorrect: true,
    interaction: { type: 'other', response: 'x', correct: 'x' },
  },
];
