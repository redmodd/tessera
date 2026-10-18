import { describe, it, expect } from 'vitest';
import type { Interaction } from '../src/runtime/interaction.js';
import {
  formatResponse,
  formatCorrectPattern,
  fitPatterns,
  SCORM12_INTERACTION_FORMAT,
  SCORM2004_INTERACTION_FORMAT,
} from '../src/runtime/interaction-format.js';

const choice: Interaction = {
  type: 'choice',
  options: ['Red', 'Green', 'Blue'],
  response: ['Blue'],
  correct: ['Green'],
};

describe('encodesOptionIndex', () => {
  it('encodes SCORM 1.2 choices as option indexes', () => {
    expect(formatResponse(choice, SCORM12_INTERACTION_FORMAT)).toBe('2');
    expect(formatCorrectPattern(choice, SCORM12_INTERACTION_FORMAT)).toEqual([
      '1',
    ]);
  });

  it('keeps encoding indexes on a copy of the SCORM 1.2 format', () => {
    const copy = { ...SCORM12_INTERACTION_FORMAT };
    expect(formatResponse(choice, copy)).toBe('2');
  });

  it('encodes identifiers when the flag is off', () => {
    expect(formatResponse(choice, SCORM2004_INTERACTION_FORMAT)).toBe('Blue');
  });

  it('slugs performance step names but keeps answers as written on SCORM 1.2', () => {
    const performance: Interaction = {
      type: 'performance',
      response: [
        ['Step 1', 'turn left'],
        ['angle', -3.5],
      ],
      correct: [['Step 1', 'done!']],
    };
    expect(formatResponse(performance, SCORM12_INTERACTION_FORMAT)).toBe(
      'Step_1.turn left,angle.-3.5',
    );
    expect(
      formatCorrectPattern(performance, SCORM12_INTERACTION_FORMAT),
    ).toEqual(['Step_1.done!']);
  });
});

describe('fitPatterns', () => {
  it.each([
    [232, true],
    [251, false],
  ])(
    'credits the case prefix only when it pushes a %i-character answer over the cap',
    (length, credited) => {
      const i: Interaction = {
        type: 'fill-in',
        response: '',
        correct: ['x'.repeat(length)],
        caseMatters: true,
      };
      const { warnings } = fitPatterns(i, SCORM2004_INTERACTION_FORMAT);
      expect(warnings).toHaveLength(1);
      expect(warnings[0].includes('counting the')).toBe(credited);
    },
  );

  it('drops a SCORM 1.2 performance pattern whose step answer runs past the cap', () => {
    const i: Interaction = {
      type: 'performance',
      response: [],
      correct: [['s', 'x'.repeat(260)]],
    };
    const { kept, warnings } = fitPatterns(i, SCORM12_INTERACTION_FORMAT);
    expect(kept).toEqual([]);
    expect(warnings).toEqual([
      expect.stringContaining('1 correct answer(s) over the 255 characters'),
    ]);
  });
});
