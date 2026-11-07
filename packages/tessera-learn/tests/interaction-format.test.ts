import { describe, it, expect, vi } from 'vitest';
import type { Interaction } from '../src/runtime/interaction.js';
import {
  formatResponse,
  fitPatterns,
  buildScormInteractionFields,
  type InteractionFormat,
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

/** The response the format records; undefined when it leaves it out. */
function recordedResponse(i: Interaction, format: InteractionFormat) {
  const { fields } = buildScormInteractionFields('q', i, null, {
    responseField: 'learner_response',
    timestampField: 'timestamp',
    timestamp: '',
    typeValue: i.type,
    resultLabels: { correct: 'correct', incorrect: 'incorrect' },
    format,
  });
  return fields.find(([key]) => key === 'learner_response')?.[1];
}

describe('optionEncoding', () => {
  it('encodes SCORM 1.2 choices as option indexes', () => {
    expect(formatResponse('q1', choice, SCORM12_INTERACTION_FORMAT)).toBe('2');
    expect(fitPatterns(choice, SCORM12_INTERACTION_FORMAT).kept).toEqual(['1']);
  });

  it('keeps encoding indexes on a copy of the SCORM 1.2 format', () => {
    const copy = { ...SCORM12_INTERACTION_FORMAT };
    expect(formatResponse('q1', choice, copy)).toBe('2');
  });

  it('encodes identifiers on SCORM 2004 for options without text', () => {
    expect(formatResponse('q1', choice, SCORM2004_INTERACTION_FORMAT)).toBe(
      'Blue',
    );
  });
});

describe('SCORM 2004 option text', () => {
  const fmt = SCORM2004_INTERACTION_FORMAT;
  const texted: Interaction = {
    type: 'choice',
    options: [
      { id: '0', text: '3' },
      { id: '1', text: '4' },
      { id: '2', text: 'Paris, France' },
    ],
    response: ['2'],
    correct: ['1'],
  };

  it('records an option with text as its 1-based position and text', () => {
    expect(formatResponse('q1', texted, fmt)).toBe('3.Paris_France');
    expect(fitPatterns(texted, fmt).kept).toEqual(['2.4']);
  });

  it.each([
    ['Ça va? Très bien!', '1.Ca_va_Tres_bien'],
    ['Straße, Łódź, Øresund', '1.Strasse_Lodz_Oresund'],
    ['ﬁsh x² Ｐａｒｉｓ', '1.fish_x2_Paris'],
    ['Ŋuoŋŋat, Ŧ ƒ ɓ ɛ ə', '1.Nuonnat_T_f_b_e'],
    ['  -42 % ', '1.42'],
    ['日本', 'japan'],
    ['—', 'japan'],
  ])('records the text %s as %s', (text, recorded) => {
    const i: Interaction = {
      type: 'choice',
      options: [{ id: 'japan', text }],
      response: ['japan'],
    };
    expect(formatResponse('q1', i, fmt)).toBe(recorded);
  });

  it('records text with no Latin letter as its position unless the id is a word', () => {
    const i: Interaction = {
      type: 'choice',
      options: [
        { id: '0', text: 'Paris' },
        { id: '1', text: 'Москва' },
        { id: '東京', text: '東京' },
        { id: 'osaka-fu', text: '大阪' },
        { id: 'kyoto_2', text: '京都' },
      ],
      response: ['0', '1', '東京', 'osaka-fu', 'kyoto_2'],
    };
    expect(formatResponse('q1', i, fmt)).toBe(
      '1.Paris[,]2._[,]3._[,]4._[,]kyoto_2',
    );
  });

  it('records an option whose text is not a string or number as its id', () => {
    const i = {
      type: 'choice',
      options: [{ id: 'paris', text: { en: 'Paris' } }],
      response: ['paris'],
    } as unknown as Interaction;
    expect(formatResponse('q1', i, fmt)).toBe('paris');
  });

  it('keeps a bare id that looks like position text apart from it', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const i: Interaction = {
      type: 'choice',
      options: ['2.B', { id: 'x', text: 'B' }],
      response: ['2.B', 'x'],
    };
    expect(recordedResponse(i, fmt)).toBe('2_B[,]2.B');
    expect(warn).not.toHaveBeenCalled();
  });

  it('warns when an option the learner did not pick records the same as one they did', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const i: Interaction = {
      type: 'choice',
      options: ['a-b', 'a b'],
      response: ['a b'],
    };
    recordedResponse(i, fmt);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('"a-b" and "a b" both as "a_b"'),
    );
  });

  it('records a repeated id as the id', () => {
    const i: Interaction = {
      type: 'sequencing',
      options: [
        { id: 'a', text: 'A' },
        { id: 'a', text: 'B' },
        { id: 'c', text: 'C' },
      ],
      response: ['a', 'a', 'c'],
    };
    expect(formatResponse('q1', i, fmt)).toBe('a[,]a[,]3.C');
  });

  it('keeps ids on xAPI and indexes on SCORM 1.2', () => {
    expect(formatResponse('q1', texted, XAPI_INTERACTION_FORMAT)).toBe('2');
    expect(formatResponse('q1', texted, SCORM12_INTERACTION_FORMAT)).toBe('2');
  });

  it('records matching pairs and sequences by position and text', () => {
    const matching: Interaction = {
      type: 'matching',
      optionPairs: {
        left: [{ id: 'l0', text: 'Cats' }],
        right: [
          { id: 'r0', text: 'Fish' },
          { id: 'r1', text: 'Mammals' },
        ],
      },
      response: [['l0', 'r1']],
      correct: [['l0', 'r1']],
    };
    expect(formatResponse('q1', matching, fmt)).toBe('1.Cats[.]2.Mammals');
    expect(fitPatterns(matching, fmt).kept).toEqual(['1.Cats[.]2.Mammals']);
    const sequencing: Interaction = {
      type: 'sequencing',
      options: [
        { id: 'a', text: 'café' },
        { id: 'b', text: 'café' },
      ],
      response: ['b', 'a'],
      correct: ['a', 'b'],
    };
    expect(formatResponse('q1', sequencing, fmt)).toBe('2.cafe[,]1.cafe');
    expect(fitPatterns(sequencing, fmt).kept).toEqual(['1.cafe[,]2.cafe']);
  });

  it('keeps the id of an option without text', () => {
    const i: Interaction = {
      type: 'choice',
      options: ['red', { id: 'green', text: '' }, { id: 'blue', text: 'Blue' }],
      response: ['red', 'green', 'blue', 'other'],
    };
    expect(formatResponse('q1', i, fmt)).toBe('red[,]green[,]3.Blue[,]other');
  });

  it('cuts position and text to 250 characters without a warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const i: Interaction = {
      type: 'choice',
      options: [
        { id: 'x'.repeat(300), text: 'a'.repeat(300) },
        { id: 'x'.repeat(301), text: 'a'.repeat(300) },
      ],
      response: ['x'.repeat(300), 'x'.repeat(301)],
    };
    expect(recordedResponse(i, fmt)).toBe(
      `1.${'a'.repeat(248)}[,]2.${'a'.repeat(248)}`,
    );
    expect(warn).not.toHaveBeenCalled();
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
    expect(formatResponse('q1', performance, SCORM12_INTERACTION_FORMAT)).toBe(
      'Step_1.turn left,angle.-3.5',
    );
    expect(fitPatterns(performance, SCORM12_INTERACTION_FORMAT).kept).toEqual([
      'Step_1.done!',
    ]);
  });

  it('folds performance step names and free-text answers on SCORM 2004', () => {
    const performance: Interaction = {
      type: 'performance',
      response: [
        ['Step 1', 'turn left'],
        ['angle', -3.5],
      ],
    };
    expect(
      formatResponse('q1', performance, SCORM2004_INTERACTION_FORMAT),
    ).toBe('Step_1[.]turn_left[,]angle[.]-3.5');
  });

  it.each([
    ['turn left', 'turn_left'],
    ['done!', 'done'],
    ['a [,] b', 'a_b'],
    ['a[:]b', 'a_b'],
    ['café', 'cafe'],
    ['東京', 'u6771u4EAC'],
    ['!', '_'],
    ['-123456', '123456'],
    ['1e+21', '1e_21'],
    [`x ${'y'.repeat(300)}`, `x_${'y'.repeat(248)}`],
    ['-3.5', '-3.5'],
    ['-99999.123456789012345678', '-99999.123456789012345678'],
    ['.5', '.5'],
    ['v1.2.3', 'v1.2.3'],
    ['snake_case', 'snake_case'],
    ['', ''],
  ])(
    'records the SCORM 2004 step answer %j as %j, which Moodle accepts',
    (answer, recorded) => {
      expect(SCORM2004_INTERACTION_FORMAT.stepAnswer(answer)).toBe(recorded);
      // Moodle's SCORM 2004 step answer: CMIDecimal, empty or CMIShortIdentifier.
      expect(recorded).toMatch(
        /^-?([0-9]{1,5})(\.[0-9]{1,18})?$|^$|^[\w.]{1,250}$/,
      );
    },
  );

  it('folds SCORM 2004 step answers but keeps a correct range', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const i: Interaction = {
      type: 'performance',
      response: [['s', '1[:]5']],
      correct: [['s', '1[:]5']],
    };
    expect(formatResponse('q1', i, SCORM2004_INTERACTION_FORMAT)).toBe(
      's[.]1_5',
    );
    expect(fitPatterns(i, SCORM2004_INTERACTION_FORMAT).kept).toEqual([
      's[.]1[:]5',
    ]);
    expect(warn).not.toHaveBeenCalled();
  });

  it('warns when SCORM 2004 changes a correct step answer', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const i: Interaction = {
      type: 'performance',
      response: [['s', 'turn left']],
      correct: [['s', 'turn left']],
    };
    expect(recordedResponse(i, SCORM2004_INTERACTION_FORMAT)).toBe(
      's[.]turn_left',
    );
    expect(warn).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining(
        'records the correct step answer "turn left" as "turn_left"',
      ),
    );
    warn.mockClear();
    recordedResponse(i, XAPI_INTERACTION_FORMAT);
    recordedResponse(i, SCORM12_INTERACTION_FORMAT);
    expect(warn).not.toHaveBeenCalled();
  });

  it('warns when a wrong step answer records the same as the correct one', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    recordedResponse(
      {
        type: 'performance',
        response: [
          ['s', 'left'],
          ['t', 'turn-left'],
        ],
        correct: [
          ['s', 'left'],
          ['t', 'turn_left'],
        ],
      },
      SCORM2004_INTERACTION_FORMAT,
    );
    expect(warn).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining(
        'records the step answer "turn-left" as "turn_left", the same as the correct answer "turn_left"',
      ),
    );
  });

  it('does not warn about a learner step answer it folds', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    recordedResponse(
      {
        type: 'performance',
        response: [['s', 'turn left']],
        correct: [['s', 'right']],
      },
      SCORM2004_INTERACTION_FORMAT,
    );
    expect(warn).not.toHaveBeenCalled();
  });

  it('keeps performance step names and answers as written on xAPI', () => {
    const performance: Interaction = {
      type: 'performance',
      response: [['Step 1', 'turn left']],
    };
    expect(formatResponse('q1', performance, XAPI_INTERACTION_FORMAT)).toBe(
      'Step 1[.]turn left',
    );
  });

  it('keeps an unnamed step unnamed on SCORM 2004', () => {
    const unnamed: Interaction = {
      type: 'performance',
      response: [['', 'go']],
    };
    expect(formatResponse('q1', unnamed, SCORM2004_INTERACTION_FORMAT)).toBe(
      '[.]go',
    );
    expect(formatResponse('q1', unnamed, SCORM12_INTERACTION_FORMAT)).toBe(
      '_.go',
    );
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
    expect(fitPatterns(i, SCORM12_INTERACTION_FORMAT).kept).toBeNull();
    expect(fitPatterns(i, XAPI_INTERACTION_FORMAT).kept).toEqual([
      's[.]1[:]5[,]t[.]x',
    ]);
    expect(
      fitPatterns(
        { ...i, correct: [['s', 'a[:]b']] },
        SCORM12_INTERACTION_FORMAT,
      ).kept,
    ).toEqual(['s.a[:]b']);
  });

  it('leaves out a correct step range before checking its other steps', () => {
    const fmt = { ...SCORM2004_INTERACTION_FORMAT, supportsRange: false };
    const i: Interaction = {
      type: 'performance',
      response: [['s', 3]],
      correct: [
        ['s', '1[:]5'],
        ['t', 'a[,]b'],
      ],
    };
    expect(fitPatterns(i, fmt)).toEqual({ kept: null, warnings: [] });
  });
});

describe('numeric ranges', () => {
  it.each<[{ min?: number; max?: number }, string[], string[] | null]>([
    [{ min: 5 }, ['5[:]'], null],
    [{ max: 5 }, ['[:]5'], null],
    [{ min: 1, max: 5 }, ['1[:]5'], null],
    [{ min: 5, max: 5 }, ['5'], ['5']],
  ])('records the correct range %j', (correct, scorm2004, scorm12) => {
    const i: Interaction = { type: 'numeric', response: 7, correct };
    expect(fitPatterns(i, SCORM2004_INTERACTION_FORMAT).kept).toEqual(
      scorm2004,
    );
    expect(fitPatterns(i, SCORM12_INTERACTION_FORMAT).kept).toEqual(scorm12);
  });
});

describe('SCORM ids', () => {
  const ids = (n: number) => Array.from({ length: n }, (_, k) => `s${k}`);
  const fmt = SCORM2004_INTERACTION_FORMAT;

  it.each([
    ['Strongly agree', 'Strongly_agree'],
    ['step-one_(a)', 'step_one__a'],
    ['a[,]b~c', 'a_b_c'],
    ['café', 'cafe'],
    ['Ærø-ß', 'AEro_ss'],
    ['urn:course:likert/agree#1', 'urn_course_likert_agree_1'],
    ['v1.2', 'v1_2'],
    ['_neutral', '_neutral'],
    ['a__b', 'a__b'],
    ['a__b-c', 'a__b_c'],
    ['_neutral!', '_neutral'],
    ['x\u0304', 'x'],
    ['東京', 'u6771u4EAC'],
    ['कि', 'u0915u093F'],
    ['𰐠', 'uD881uDC20'],
    ['Мир', 'u041Cu0438u0440'],
    ['-', '_'],
    ['', '_'],
    ['a\uD800', 'a'],
  ])(
    'records %s as %s on SCORM 1.2 and 2004, which Moodle accepts',
    (id, recorded) => {
      const likert: Interaction = { type: 'likert', response: id };
      expect(formatResponse('q1', likert, fmt)).toBe(recorded);
      expect(formatResponse('q1', likert, SCORM12_INTERACTION_FORMAT)).toBe(
        recorded,
      );
      expect(SCORM12_INTERACTION_FORMAT.identifier(id)).toBe(recorded);
      // Moodle's SCORM 2004 CMIShortIdentifier.
      expect(recorded).toMatch(/^[\w.]{1,250}$/);
    },
  );

  it.each([
    ['q-planet', 'q-planet'],
    ['module.1/q#2', 'module.1/q#2'],
    ['東京', '東京'],
    ['my question', 'my_question'],
    [' a \t\n b ', 'a_b'],
    ['q 🚀 1', 'q_1'],
    ['👍🏽q👨‍👩‍👧', 'q'],
    ['🇨🇦q', 'q'],
    ['1️⃣q', '1_q'],
    ['☺q', 'q'],
    ['q\uD83Dx', 'q_x'],
    ['🚀', '_'],
    ['urn:course:q1', 'urn:course:q1'],
    ['urn:q1', 'urn_q1'],
    ['urn:bad_nid:q1', 'urn_bad_nid:q1'],
    ['urn:course:', 'urn_course:'],
    ['urn:course:🚀', 'urn_course:'],
    ['urn:course:   ', 'urn_course:'],
    ['', '_'],
    ['   ', '_'],
    ['x'.repeat(4001), 'x'.repeat(4000)],
    [`urn:course:${'x'.repeat(4000)}`, `urn:course:${'x'.repeat(3989)}`],
    [`${'x'.repeat(3999)}𰐠`, 'x'.repeat(3999)],
  ])(
    'records the SCORM 2004 interaction id %s as %s, which Moodle accepts',
    (id, recorded) => {
      expect(fmt.identifier(id)).toBe(recorded);
      // Moodle's SCORM 2004 CMILongIdentifier.
      expect(recorded).toMatch(
        /^(?:(?!urn:)\S{1,4000}|urn:[A-Za-z0-9-]{1,31}:\S{1,4000})$/,
      );
    },
  );

  it('keeps ids in other scripts apart', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const i: Interaction = {
      type: 'sequencing',
      response: ['Привет', 'Мир'],
      correct: ['Привет', 'Мир'],
    };
    expect(recordedResponse(i, fmt)).toBe(
      'u041Fu0440u0438u0432u0435u0442[,]u041Cu0438u0440',
    );
    expect(fitPatterns(i, fmt).kept).toHaveLength(1);
    expect(warn).not.toHaveBeenCalled();
  });

  it.each([
    ['あ0', '𰐠'],
    ['कि', 'का'],
  ])('keeps %s and %s apart', (a, b) => {
    expect(fmt.responseId(a)).not.toBe(fmt.responseId(b));
  });

  it('warns that a long likert value is cut, not changed', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    recordedResponse({ type: 'likert', response: 'a'.repeat(300) }, fmt);
    expect(warn).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('cut to the 250 characters'),
    );
  });

  it('warns when it changes a likert value', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    recordedResponse({ type: 'likert', response: 'Strongly agree' }, fmt);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining(
        'records the likert value "Strongly agree" as "Strongly_agree"',
      ),
    );
  });

  it('names both likert options that record the same', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    recordedResponse(
      { type: 'likert', options: ['agree_1', 'agree-1'], response: 'agree_1' },
      fmt,
    );
    expect(warn).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('"agree_1" and "agree-1" both as "agree_1"'),
    );
  });

  it('records a choice id once', () => {
    expect(
      formatResponse(
        'q1',
        { type: 'choice', response: ['', '_', 'a', 'a'] },
        fmt,
      ),
    ).toBe('_[,]a');
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
    expect(formatResponse('q1', seq, fmt)).toBe('a[,]b[,]a');
    for (const i of [seq, steps]) {
      expect(fitPatterns(i, fmt)).toEqual({
        kept: null,
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
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(recordedResponse(i, fmt)).toBeUndefined();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining(error));
    expect(() =>
      formatResponse('q1', i, XAPI_INTERACTION_FORMAT),
    ).not.toThrow();
    expect(recordedResponse(i, SCORM12_INTERACTION_FORMAT)).toBeDefined();
  });

  it.each([
    ['an id', 'a'.repeat(300), 'a'.repeat(250)],
    ['a folded id', 'ß'.repeat(126), 'ss'.repeat(125)],
    ['a code point', 'a'.repeat(248) + '東', 'a'.repeat(248)],
  ])('cuts %s to 250 characters', (_, id, recorded) => {
    expect(formatResponse('q1', { type: 'likert', response: id }, fmt)).toBe(
      recorded,
    );
  });
});

describe('cutting a response', () => {
  const zalgo = 'a' + '́'.repeat(300);
  const flag = '\u{1F3F4}' + '\u{E0061}'.repeat(200);

  it.each([
    [SCORM12_INTERACTION_FORMAT, zalgo, zalgo.slice(0, 255)],
    [
      SCORM2004_INTERACTION_FORMAT,
      `ok[,]${zalgo}`,
      `ok[,]${zalgo.slice(0, 250)}`,
    ],
    [SCORM2004_INTERACTION_FORMAT, `ok${zalgo}`, `ok${zalgo.slice(0, 248)}`],
    [SCORM12_INTERACTION_FORMAT, flag, flag.slice(0, 254)],
  ])(
    'cuts a character longer than the cap rather than dropping it (%#)',
    (fmt, response, recorded) => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      expect(formatResponse('q1', { type: 'fill-in', response }, fmt)).toBe(
        recorded,
      );
    },
  );
});

describe('fitPatterns', () => {
  it('leaves out the whole field when a dropped answer also breaks a field rule', () => {
    const fmt = {
      ...SCORM2004_INTERACTION_FORMAT,
      rules: {
        'long-fill-in': { correct: { undelimited: true, maxItems: 0 } },
      },
    };
    expect(() =>
      fitPatterns(
        { type: 'long-fill-in', response: '', correct: ['{lang=en}x'] },
        fmt,
      ),
    ).toThrow('more than the 0');
  });

  it.each([
    ['fill-in', 250],
    ['long-fill-in', 4000],
  ] as const)(
    'keeps a case-sensitive %s answer of %i characters, not counting the prefix',
    (type, length) => {
      const { kept, warnings } = fitPatterns(
        {
          type,
          response: '',
          correct: ['x'.repeat(length)],
          caseMatters: true,
        },
        SCORM2004_INTERACTION_FORMAT,
      );
      expect(kept).toEqual(['{case_matters=true}' + 'x'.repeat(length)]);
      expect(warnings).toEqual([]);
    },
  );

  it.each([
    [' Paris', 'starting or ending in whitespace'],
    ['a[,]a', 'repeating a [,]-separated part'],
  ])(
    'checks a case-sensitive answer %j without its prefix',
    (answer, reason) => {
      const { kept, warnings } = fitPatterns(
        { type: 'fill-in', response: '', correct: [answer], caseMatters: true },
        SCORM2004_INTERACTION_FORMAT,
      );
      expect(kept).toBeNull();
      expect(warnings).toEqual([expect.stringContaining(reason)]);
    },
  );

  it('drops a SCORM 2004 fill-in answer starting or ending in whitespace', () => {
    const i: Interaction = {
      type: 'fill-in',
      response: '',
      correct: ['Paris ', ' Rome', 'a[,] b', 'Oslo'],
    };
    const fit = fitPatterns(i, SCORM2004_INTERACTION_FORMAT);
    expect(fit.kept).toEqual(['Oslo']);
    expect(fit.warnings).toEqual([
      expect.stringContaining(
        '3 correct answer(s) starting or ending in whitespace, or with whitespace beside [,]',
      ),
    ]);
    expect(fitPatterns(i, XAPI_INTERACTION_FORMAT).warnings).toEqual([]);
  });

  it.each([
    '{lang=en}Paris',
    '{case_matters=true}Paris',
    '{order_matters=false}a[,]b',
    '{case_matters=yes}Paris',
    'a[,]{lang=en}b',
    'a[,]{case_matters=true}b',
  ])('drops an answer %j the LMS reads as a delimiter', (answer) => {
    const i: Interaction = {
      type: 'fill-in',
      response: '',
      correct: [answer, 'Oslo'],
    };
    const warning = expect.stringContaining(
      '1 correct answer(s) starting with {lang=}, {case_matters=} or {order_matters=}',
    );
    for (const fmt of [SCORM2004_INTERACTION_FORMAT, XAPI_INTERACTION_FORMAT]) {
      expect(fitPatterns(i, fmt)).toEqual({
        kept: ['Oslo'],
        warnings: [warning],
      });
    }
    expect(fitPatterns(i, SCORM12_INTERACTION_FORMAT).kept).toEqual([
      answer,
      'Oslo',
    ]);
  });

  it.each([
    [
      'fill-in',
      '{case_matters=true Paris',
      '{case_matters= or {order_matters=',
    ],
    [
      'fill-in',
      '{order_matters=true Paris',
      '{case_matters= or {order_matters=',
    ],
    ['long-fill-in', '{case_matters=true Paris', '{case_matters='],
  ] as const)(
    'drops a %s answer %j opening with an unclosed delimiter only under SCORM 2004',
    (type, answer, starts) => {
      const i: Interaction = { type, response: '', correct: [answer, 'Oslo'] };
      expect(fitPatterns(i, SCORM2004_INTERACTION_FORMAT)).toEqual({
        kept: ['Oslo'],
        warnings: [
          expect.stringContaining(
            `1 correct answer(s) starting with ${starts}, which this export standard rejects`,
          ),
        ],
      });
      expect(fitPatterns(i, XAPI_INTERACTION_FORMAT).kept).toEqual(i.correct);
    },
  );

  it.each([
    ['fill-in', '{lang=en Paris'],
    ['fill-in', 'a[,]{case_matters=true b'],
    ['fill-in', '{case_matters Paris'],
    ['long-fill-in', '{order_matters=true Paris'],
  ] as const)(
    'keeps a %s answer %j with an unclosed delimiter',
    (type, answer) => {
      const i: Interaction = { type, response: '', correct: [answer] };
      for (const fmt of [
        SCORM2004_INTERACTION_FORMAT,
        XAPI_INTERACTION_FORMAT,
      ]) {
        expect(fitPatterns(i, fmt)).toEqual({ kept: [answer], warnings: [] });
      }
    },
  );

  it('drops a long-fill-in answer starting with an unclosed {lang= only under SCORM 2004', () => {
    const i: Interaction = {
      type: 'long-fill-in',
      response: '',
      correct: ['{lang=en Paris', 'Oslo'],
    };
    expect(fitPatterns(i, SCORM2004_INTERACTION_FORMAT)).toEqual({
      kept: ['Oslo'],
      warnings: [
        expect.stringContaining(
          '1 correct answer(s) starting with {lang=, which this export standard rejects',
        ),
      ],
    });
    expect(fitPatterns(i, XAPI_INTERACTION_FORMAT).kept).toEqual(i.correct);
  });

  it.each<[Interaction]>([
    [{ type: 'fill-in', response: '{lang=en}Paris' }],
    [{ type: 'fill-in', response: 'a[,]{lang=}x' }],
    [{ type: 'long-fill-in', response: '{lang=en Paris' }],
  ])('leaves out a SCORM 2004 response read as a language tag: %j', (i) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(recordedResponse(i, SCORM2004_INTERACTION_FORMAT)).toBeUndefined();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('reads as a language tag or rejects'),
    );
  });

  it('keeps a SCORM 2004 response starting with {case_matters=}', () => {
    const i: Interaction = {
      type: 'fill-in',
      response: '{case_matters=true}Paris',
    };
    expect(recordedResponse(i, SCORM2004_INTERACTION_FORMAT)).toBe(
      '{case_matters=true}Paris',
    );
  });

  it.each<[Interaction]>([
    [{ type: 'fill-in', response: '{lang=en}Paris' }],
    [{ type: 'fill-in', response: '{case_matters=true}Paris' }],
    [{ type: 'fill-in', response: 'a[,]{order_matters=}b' }],
    [{ type: 'long-fill-in', response: '{lang=en}Paris' }],
  ])('leaves out an xAPI response read as a delimiter: %j', (i) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(formatResponse('q1', i, XAPI_INTERACTION_FORMAT)).toBeNull();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining(
        'which this export standard reads as a delimiter',
      ),
    );
  });

  it.each([
    ['fill-in', '{lang=en Paris'],
    ['long-fill-in', '{case_matters=true Paris'],
  ] as const)(
    'keeps an xAPI %s response %j with an unclosed delimiter',
    (type, response) => {
      expect(
        formatResponse('q1', { type, response }, XAPI_INTERACTION_FORMAT),
      ).toBe(response);
    },
  );

  it.each<[Interaction]>([
    [{ type: 'numeric', response: 3, correct: { min: 5, max: 1 } }],
    [{ type: 'performance', response: [], correct: [['s', '5[:]1']] }],
  ])('drops a reversed correct range on SCORM 2004: %j', (i) => {
    expect(fitPatterns(i, SCORM2004_INTERACTION_FORMAT)).toEqual({
      kept: null,
      warnings: [expect.stringContaining('minimum above its maximum')],
    });
  });

  it('records an empty SCORM 2004 choice pattern as no choice correct', () => {
    const i: Interaction = { type: 'choice', response: ['a'], correct: [] };
    expect(fitPatterns(i, SCORM2004_INTERACTION_FORMAT)).toEqual({
      kept: [''],
      warnings: [],
    });
  });

  it('drops a SCORM 1.2 performance pattern whose step answer runs past the cap', () => {
    const i: Interaction = {
      type: 'performance',
      response: [],
      correct: [['s', 'x'.repeat(260)]],
    };
    const { kept, warnings } = fitPatterns(i, SCORM12_INTERACTION_FORMAT);
    expect(kept).toBeNull();
    expect(warnings).toEqual([
      expect.stringContaining('1 correct answer(s) over the 255 characters'),
    ]);
  });
});
