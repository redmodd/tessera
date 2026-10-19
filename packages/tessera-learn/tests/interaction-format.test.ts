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
});

describe('performance steps', () => {
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

  it('keeps an unnamed step unnamed on SCORM 2004', () => {
    const unnamed: Interaction = {
      type: 'performance',
      response: [['', 'go']],
    };
    expect(formatResponse(unnamed, SCORM2004_INTERACTION_FORMAT)).toBe('[.]go');
    expect(formatResponse(unnamed, SCORM12_INTERACTION_FORMAT)).toBe('_.go');
  });

  it('leaves out a correct step range on SCORM 1.2 only', () => {
    const i: Interaction = {
      type: 'performance',
      response: [['s', 3]],
      correct: [
        ['s', '1[:]5'],
        ['t', 'x'],
      ],
    };
    expect(formatCorrectPattern(i, SCORM12_INTERACTION_FORMAT)).toBeNull();
    expect(formatCorrectPattern(i, XAPI_INTERACTION_FORMAT)).toEqual([
      's[.]1[:]5[,]t[.]x',
    ]);
    expect(
      formatCorrectPattern(
        { ...i, correct: [['s', 'a[:]b']] },
        SCORM12_INTERACTION_FORMAT,
      ),
    ).toEqual(['s.a[:]b']);
  });
});

describe('SCORM 2004 ids inside a response', () => {
  const ids = (n: number) => Array.from({ length: n }, (_, k) => `s${k}`);
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

  it('records a choice id once', () => {
    expect(
      formatResponse({ type: 'choice', response: ['', '_', 'a', 'a'] }, fmt),
    ).toBe('_[,]a');
  });

  it('refuses a step answer holding a delimiter, except a correct range', () => {
    const i: Interaction = {
      type: 'performance',
      response: [['s', 'a [,] b']],
      correct: [['s', '-1.5[:]2']],
    };
    expect(() => formatResponse(i, fmt)).toThrow('holds [,], [.] or [:]');
    expect(formatCorrectPattern(i, fmt)).toEqual(['s[.]-1.5[:]2']);
    expect(() =>
      formatCorrectPattern({ ...i, correct: [['s', 'a[:]b']] }, fmt),
    ).toThrow('holds [,], [.] or [:]');
    expect(formatResponse(i, XAPI_INTERACTION_FORMAT)).toBe('s[.]a [,] b');
    expect(formatResponse(i, SCORM12_INTERACTION_FORMAT)).toBe('s.a [,] b');
  });

  it('drops a correct sequence or step list that repeats an item', () => {
    const seq: Interaction = {
      type: 'sequencing',
      response: ['a', 'b', 'a'],
      correct: ['a', 'b', 'a'],
    };
    const steps: Interaction = {
      type: 'performance',
      response: [],
      correct: [
        ['s', 'x'],
        ['s', 'x'],
      ],
    };
    expect(formatResponse(seq, fmt)).toBe('a[,]b[,]a');
    for (const i of [seq, steps]) {
      expect(fitPatterns(i, fmt)).toEqual({
        kept: [],
        warnings: [
          expect.stringContaining('1 correct answer(s) repeating an item'),
        ],
      });
    }
    expect(fitPatterns(seq, XAPI_INTERACTION_FORMAT).kept).toEqual([
      'a[,]b[,]a',
    ]);
  });

  it.each<[string, Interaction, string]>([
    [
      '37 sequence items',
      { type: 'sequencing', response: ids(37) },
      'it has 37 items, more than the 36',
    ],
    ['an empty choice', { type: 'choice', response: [] }, 'has no items'],
    [
      'a step with neither name nor answer',
      { type: 'performance', response: [['', '']] },
      'neither a name nor an answer',
    ],
    [
      'an 11-part fill-in',
      { type: 'fill-in', response: ids(11).join('[,]') },
      'it has 11 [,]-separated parts, more than the 10',
    ],
  ])('refuses %s on SCORM 2004 only', (_, i, error) => {
    expect(() => formatResponse(i, fmt)).toThrow(error);
    expect(() => formatResponse(i, XAPI_INTERACTION_FORMAT)).not.toThrow();
    expect(() => formatResponse(i, SCORM12_INTERACTION_FORMAT)).not.toThrow();
  });

  it.each([
    ['an escape', 'a'.repeat(248) + ' b', 'a'.repeat(248)],
    ['a character', 'é'.repeat(42), '%C3%A9'.repeat(41)],
  ])('cuts an id to 250 characters without splitting %s', (_, id, recorded) => {
    expect(formatResponse({ type: 'likert', response: id }, fmt)).toBe(
      recorded,
    );
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

  it.each<[string, Interaction, string[], string]>([
    [
      'fill-in',
      {
        type: 'fill-in',
        response: '',
        correct: ['Paris ', ' Rome', 'a[,] b', 'Oslo'],
      },
      ['Oslo'],
      '3 correct answer(s) starting or ending in whitespace, or with whitespace beside [,]',
    ],
    [
      'performance',
      {
        type: 'performance',
        response: [],
        correct: [
          ['s', 'done '],
          ['t', 'x'],
        ],
      },
      [],
      '1 correct answer(s) with an item starting or ending in whitespace',
    ],
  ])(
    'drops a SCORM 2004 %s answer starting or ending in whitespace',
    (_, i, kept, warning) => {
      const fit = fitPatterns(i, SCORM2004_INTERACTION_FORMAT);
      expect(fit.kept).toEqual(kept);
      expect(fit.warnings).toEqual([expect.stringContaining(warning)]);
      expect(fitPatterns(i, XAPI_INTERACTION_FORMAT).warnings).toEqual([]);
    },
  );

  it.each<[Interaction]>([
    [{ type: 'numeric', response: 3, correct: { min: 5, max: 1 } }],
    [{ type: 'performance', response: [], correct: [['s', '5[:]1']] }],
  ])('drops a reversed correct range on SCORM 2004: %j', (i) => {
    expect(fitPatterns(i, SCORM2004_INTERACTION_FORMAT)).toEqual({
      kept: [],
      warnings: [expect.stringContaining('minimum above its maximum')],
    });
  });

  it.each<[{ min?: number; max?: number }, string[], string[] | null]>([
    [{ min: 5 }, ['5[:]'], null],
    [{ max: 5 }, ['[:]5'], null],
    [{ min: 1, max: 5 }, ['1[:]5'], null],
    [{ min: 5, max: 5 }, ['5'], ['5']],
  ])('records the numeric correct range %j', (correct, scorm2004, scorm12) => {
    const i: Interaction = { type: 'numeric', response: 7, correct };
    expect(formatCorrectPattern(i, SCORM2004_INTERACTION_FORMAT)).toEqual(
      scorm2004,
    );
    expect(formatCorrectPattern(i, SCORM12_INTERACTION_FORMAT)).toEqual(
      scorm12,
    );
  });

  it('records an empty SCORM 2004 choice pattern as no choice correct', () => {
    const i: Interaction = { type: 'choice', response: ['a'], correct: [] };
    expect(formatCorrectPattern(i, SCORM2004_INTERACTION_FORMAT)).toEqual(['']);
  });

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
