import { describe, it, expect } from 'vitest';
import type { Interaction } from '../src/runtime/interaction.js';
import {
  formatResponse,
  formatCorrectPattern,
  fitPatterns,
  SCORM12_INTERACTION_FORMAT,
  SCORM2004_INTERACTION_FORMAT,
  XAPI_INTERACTION_FORMAT,
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

  it('percent-encodes performance step names but keeps answers as written on SCORM 2004', () => {
    const performance: Interaction = {
      type: 'performance',
      response: [
        ['Step 1', 'turn left'],
        ['angle', -3.5],
      ],
    };
    expect(formatResponse(performance, SCORM2004_INTERACTION_FORMAT)).toBe(
      'Step%201[.]turn left[,]angle[.]-3.5',
    );
  });

  it('keeps performance step names and answers as written on xAPI', () => {
    const performance: Interaction = {
      type: 'performance',
      response: [['Step 1', 'turn left']],
    };
    expect(formatResponse(performance, XAPI_INTERACTION_FORMAT)).toBe(
      'Step 1[.]turn left',
    );
  });
});

describe('SCORM 2004 ids inside a response', () => {
  const fmt = SCORM2004_INTERACTION_FORMAT;

  it.each([
    ['Strongly agree', 'Strongly%20agree'],
    ['step-one_(a)', 'step-one_(a)'],
    ['a[,]b~c', 'a%5B%2C%5Db%7Ec'],
    ['café', 'caf%C3%A9'],
    ['urn:course:likert/agree#1', 'urn:course:likert/agree#1'],
    ['a%20b', 'a%2520b'],
    ['a?b&c', 'a%3Fb%26c'],
    ['-', '%2D'],
    ['::', '%3A%3A'],
    ['(*)', '%28%2A%29'],
    ['', '_'],
    ['a\uD800', 'a%EF%BF%BD'],
  ])('records %s as %s', (id, recorded) => {
    expect(formatResponse({ type: 'likert', response: id }, fmt)).toBe(
      recorded,
    );
  });

  it('encodes every list type and the likert correct answer', () => {
    expect(
      formatResponse({ type: 'choice', response: ['New York', 'Paris'] }, fmt),
    ).toBe('New%20York[,]Paris');
    expect(
      formatResponse(
        { type: 'matching', response: [['New York', 'USA']] },
        fmt,
      ),
    ).toBe('New%20York[.]USA');
    expect(
      formatResponse(
        { type: 'sequencing', response: ['step one', 'step two'] },
        fmt,
      ),
    ).toBe('step%20one[,]step%20two');
    expect(
      formatCorrectPattern(
        { type: 'likert', response: 'x', correct: 'Strongly agree' },
        fmt,
      ),
    ).toEqual(['Strongly%20agree']);
  });

  it('keeps an unnamed performance step unnamed', () => {
    expect(
      formatResponse({ type: 'performance', response: [['', 'go']] }, fmt),
    ).toBe('[.]go');
    expect(
      formatResponse(
        { type: 'performance', response: [['', 'go']] },
        SCORM12_INTERACTION_FORMAT,
      ),
    ).toBe('_.go');
  });

  it('cuts an id to 250 characters without splitting an escape', () => {
    const recorded = formatResponse(
      { type: 'likert', response: 'a'.repeat(248) + ' b' },
      fmt,
    );
    expect(recorded).toBe('a'.repeat(248));
  });

  it('cuts an id to 250 characters without splitting a character', () => {
    const recorded = formatResponse(
      { type: 'likert', response: 'é'.repeat(42) },
      fmt,
    );
    expect(recorded).toBe('%C3%A9'.repeat(41));
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
