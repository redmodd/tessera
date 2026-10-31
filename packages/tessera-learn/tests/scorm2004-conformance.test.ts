// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { SCORM2004Adapter } from '../src/runtime/adapters/scorm2004.js';
import type { SavedState } from '../src/runtime/persistence.js';
import type { Interaction } from '../src/runtime/interaction.js';
import {
  createReal2004Lms,
  relaunch2004,
  type RealLms2004,
} from './helpers/real-lms.js';
import { flush } from './helpers.js';

const ids = (n: number) => Array.from({ length: n }, (_, k) => `s${k}`);

describe('SCORM2004Adapter against scorm-again', () => {
  let lms: RealLms2004;
  let adapter: SCORM2004Adapter;

  function start(): Promise<void> {
    lms = createReal2004Lms();
    adapter = new SCORM2004Adapter(lms.api);
    return adapter.init();
  }

  it('a full happy-path session produces no rejected writes', async () => {
    await start();
    adapter.saveState({ b: 3, v: [0, 1, 2, 3], g: { '2': { s: 80 } }, d: 100 });
    adapter.setScore(85);
    adapter.setCompletionStatus('complete');
    adapter.setSuccessStatus('passed');
    adapter.setDuration(3661);
    adapter.setExit('suspend');
    adapter.reportInteraction(
      'q1',
      { type: 'choice', response: ['a', 'b'], correct: ['a'] },
      false,
    );
    adapter.commit();
    await flush();
    expect(lms.errors).toEqual([]);
  });

  it('stores raw/min/max/scaled score the runtime reads back', async () => {
    await start();
    adapter.setScore(85);
    await flush();
    expect(lms.errors).toEqual([]);
    expect(lms.raw.GetValue('cmi.score.raw')).toBe('85');
    expect(lms.raw.GetValue('cmi.score.min')).toBe('0');
    expect(lms.raw.GetValue('cmi.score.max')).toBe('100');
    // §4.2.4.3.5 — scaled is score/100 bounded to [-1, 1].
    expect(lms.raw.GetValue('cmi.score.scaled')).toBe('0.85');
  });

  it('writes completion + success status and progress_measure', async () => {
    await start();
    adapter.setCompletionStatus('complete');
    adapter.setSuccessStatus('passed');
    await flush();
    expect(lms.errors).toEqual([]);
    expect(lms.raw.GetValue('cmi.completion_status')).toBe('completed');
    expect(lms.raw.GetValue('cmi.success_status')).toBe('passed');
    expect(lms.raw.GetValue('cmi.progress_measure')).toBe('1');
  });

  it('accepts the "unknown" success_status the adapter writes to block rollup', async () => {
    await start();
    adapter.setSuccessStatus('unknown');
    await flush();
    expect(lms.errors).toEqual([]);
    expect(lms.raw.GetValue('cmi.success_status')).toBe('unknown');
  });

  it('persists suspend_data + location the runtime reads back', async () => {
    await start();
    const state: SavedState = { b: 4, v: [0, 1, 2, 3, 4], d: 50 };
    adapter.saveState(state);
    await flush();
    expect(lms.errors).toEqual([]);
    expect(lms.raw.GetValue('cmi.suspend_data')).toBe(JSON.stringify(state));
    expect(lms.raw.GetValue('cmi.location')).toBe('4');
  });

  describe('interactions (readable — verified by read-back)', () => {
    it('a choice interaction round-trips through the data model', async () => {
      await start();
      adapter.reportInteraction(
        'q1',
        { type: 'choice', response: ['a', 'b'], correct: ['a'] },
        false,
      );
      await flush();
      expect(lms.errors).toEqual([]);
      expect(lms.raw.GetValue('cmi.interactions.0.id')).toBe('q1');
      expect(lms.raw.GetValue('cmi.interactions.0.type')).toBe('choice');
      expect(lms.raw.GetValue('cmi.interactions.0.result')).toBe('incorrect');
    });

    it.each([
      ['true-false', { type: 'true-false', response: true, correct: false }],
      ['fill-in', { type: 'fill-in', response: 'paris', correct: ['paris'] }],
      ['likert', { type: 'likert', response: 'agree' }],
      // numeric with min == max writes a single-value pattern (no [:] range
      // delimiter), which the data model accepts.
      [
        'numeric',
        { type: 'numeric', response: 7, correct: { min: 7, max: 7 } },
      ],
      ['numeric', { type: 'numeric', response: 7, correct: { min: 5 } }],
    ] as const)(
      'a %s interaction is accepted by the data model',
      async (label, interaction) => {
        await start();
        adapter.reportInteraction('q1', interaction as never, true);
        await flush();
        expect(lms.errors).toEqual([]);
        expect(lms.raw.GetValue('cmi.interactions.0.id')).toBe('q1');
        expect(lms.raw.GetValue('cmi.interactions.0.type')).toBe(label);
      },
    );

    it.each([
      [{ type: 'numeric', response: 3, correct: { max: 5 } }, '[:]5'],
      [
        {
          type: 'performance',
          response: [['s', '3']],
          correct: [['s', '1[:]5']],
        },
        's[.]1[:]5',
      ],
      [
        {
          type: 'performance',
          response: [['s', '3']],
          correct: [['s', '[:]5']],
        },
        's[.][:]5',
      ],
    ] as const)(
      'the data model accepts the range pattern $1',
      async (interaction, pattern) => {
        await start();
        adapter.reportInteraction('q1', interaction as never, true);
        await flush();
        expect(lms.errors).toEqual([]);
        expect(
          lms.raw.GetValue('cmi.interactions.0.correct_responses.0.pattern'),
        ).toBe(pattern);
      },
    );

    it.each([
      ['fill-in', 250],
      ['long-fill-in', 4000],
      ['other', 4000],
    ] as const)(
      'a %s response over %i characters is cut to fit',
      async (type, max) => {
        await start();
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        const long = 'a'.repeat(max + 1);
        const interaction: Interaction =
          type === 'other'
            ? { type, response: long, correct: long }
            : {
                type,
                response: long,
                correct: [long, 'b'.repeat(max)],
                caseMatters: true,
              };
        adapter.reportInteraction('q1', interaction, true);
        await flush();
        expect(lms.errors).toEqual([]);
        expect(lms.raw.GetValue('cmi.interactions.0.learner_response')).toBe(
          'a'.repeat(max),
        );
        expect(
          lms.raw.GetValue('cmi.interactions.0.correct_responses._count'),
        ).toBe(type === 'other' ? '0' : '1');
      },
    );

    it.each([
      ['an id', 'a'.repeat(300), 'a'.repeat(250)],
      ['an id with no letter or digit', '-'.repeat(100), '%2D'.repeat(83)],
    ])('warns once when it cuts %s to 250 characters', async (_, id, cut) => {
      await start();
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      adapter.reportInteraction(
        'q1',
        { type: 'choice', response: [id], correct: [id] },
        true,
      );
      await flush();
      expect(lms.errors).toEqual([]);
      expect(lms.raw.GetValue('cmi.interactions.0.learner_response')).toBe(cut);
      expect(warn).toHaveBeenCalledOnce();
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining(
          `interaction "q1" records the id "${id}" cut to the 250 characters`,
        ),
      );
    });

    it('a performance step answer over 250 characters is cut to fit', async () => {
      await start();
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const steps: Array<[string, string]> = [
        ['s1', 'a'.repeat(251)],
        ['s2', 'done'],
      ];
      adapter.reportInteraction(
        'q1',
        { type: 'performance', response: steps, correct: steps },
        true,
      );
      await flush();
      expect(lms.errors).toEqual([]);
      expect(lms.raw.GetValue('cmi.interactions.0.learner_response')).toBe(
        `s1[.]${'a'.repeat(250)}[,]s2[.]done`,
      );
      expect(
        lms.raw.GetValue('cmi.interactions.0.correct_responses._count'),
      ).toBe('0');
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining(
          '"q1" has a step answer over the 250 characters this export standard records; the LMS gets its first 250 characters',
        ),
      );
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining(
          '"q1" has a correct step answer over the 250 characters',
        ),
      );
    });

    it.each([
      [
        'likert',
        {
          type: 'likert',
          response: 'Strongly agree',
          correct: 'Strongly agree',
        },
        'Strongly%20agree',
      ],
      [
        'matching',
        {
          type: 'matching',
          response: [['New York', 'USA']],
          correct: [['New York', 'USA']],
        },
        'New%20York[.]USA',
      ],
      [
        'sequencing',
        {
          type: 'sequencing',
          response: ['step one', 'step two'],
          correct: ['step one', 'step two'],
        },
        'step%20one[,]step%20two',
      ],
      [
        'performance',
        {
          type: 'performance',
          response: [['step one', 'all done']],
          correct: [['step one', 'all done']],
        },
        'step%20one[.]all done',
      ],
      [
        'URN likert',
        {
          type: 'likert',
          response: 'urn:course:agree',
          correct: 'urn:course:agree',
        },
        'urn:course:agree',
      ],
      [
        'unnamed performance step',
        {
          type: 'performance',
          response: [['', 'all done']],
          correct: [['', 'all done']],
        },
        '[.]all done',
      ],
      [
        'punctuation-only likert',
        { type: 'likert', response: '-', correct: '-' },
        '%2D',
      ],
      [
        'merged choice',
        { type: 'choice', response: ['', '_'], correct: ['', '_'] },
        '_',
      ],
    ] as const)(
      'records %s ids so the data model accepts them',
      async (_label, interaction, recorded) => {
        await start();
        adapter.reportInteraction('q1', interaction as never, true);
        await flush();
        expect(lms.errors).toEqual([]);
        expect(lms.raw.GetValue('cmi.interactions.0.learner_response')).toBe(
          recorded,
        );
        expect(
          lms.raw.GetValue('cmi.interactions.0.correct_responses.0.pattern'),
        ).toBe(recorded);
      },
    );

    it('leaves out a step answer holding a delimiter but keeps a correct range', async () => {
      await start();
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      adapter.reportInteraction(
        'q1',
        {
          type: 'performance',
          response: [['s', 'turn [.] left']],
          correct: [['s', '1[:]5']],
        },
        false,
      );
      await flush();
      expect(lms.errors).toEqual([]);
      expect(lms.raw.GetValue('cmi.interactions.0.learner_response')).toBe('');
      expect(
        lms.raw.GetValue('cmi.interactions.0.correct_responses.0.pattern'),
      ).toBe('s[.]1[:]5');
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining(
          'the response of interaction "q1" is left out of the LMS record: the step answer "turn [.] left" holds [,], [.] or [:]',
        ),
      );
    });

    it('leaves out a reversed numeric range the data model rejects', async () => {
      await start();
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      adapter.reportInteraction(
        'q1',
        { type: 'numeric', response: 3, correct: { min: 5, max: 1 } },
        false,
      );
      await flush();
      expect(lms.errors).toEqual([]);
      expect(lms.raw.GetValue('cmi.interactions._count')).toBe('1');
      expect(
        lms.raw.GetValue('cmi.interactions.0.correct_responses._count'),
      ).toBe('0');
      expect(lms.raw.GetValue('cmi.interactions.0.result')).toBe('incorrect');
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('minimum above its maximum'),
      );
    });

    it.each([
      [
        'a correct step answer ending in a space',
        {
          type: 'performance',
          response: [['s', 'done ']],
          correct: [['s', 'done ']],
        },
        's[.]done ',
        '',
        'starting or ending in whitespace',
      ],
      [
        'a case-sensitive answer starting with a space',
        {
          type: 'fill-in',
          response: 'Paris',
          correct: [' Paris'],
          caseMatters: true,
        },
        'Paris',
        '',
        'starting or ending in whitespace',
      ],
      [
        'a repeated sequence item',
        {
          type: 'sequencing',
          response: ['a', 'b', 'a'],
          correct: ['a', 'b', 'a'],
        },
        'a[,]b[,]a',
        '',
        'repeating an item',
      ],
      [
        'a repeated matching pair',
        {
          type: 'matching',
          response: [
            ['a', 'b'],
            ['a', 'b'],
          ],
          correct: [
            ['a', 'b'],
            ['a', 'b'],
          ],
        },
        'a[.]b',
        'a[.]b',
        undefined,
      ],
      [
        'a fill-in answer that repeats an item',
        { type: 'fill-in', response: 'a', correct: ['a[,]a'] },
        'a',
        '',
        'repeating a [,]-separated part',
      ],
      [
        'a fill-in answer starting with {case_matters=}',
        {
          type: 'fill-in',
          response: 'Paris',
          correct: ['{case_matters=true}Paris'],
        },
        'Paris',
        '',
        'which this export standard reads as a delimiter',
      ],
      [
        'a case-sensitive fill-in answer starting with {case_matters=}',
        {
          type: 'fill-in',
          response: 'Paris',
          correct: ['{case_matters=true}Paris'],
          caseMatters: true,
        },
        'Paris',
        '',
        'which this export standard reads as a delimiter',
      ],
      [
        'a fill-in answer with a part starting with {lang=}',
        { type: 'fill-in', response: 'a', correct: ['a[,]{lang=en}b'] },
        'a',
        '',
        'which this export standard reads as a delimiter',
      ],
      [
        'a long-fill-in answer starting with {lang=}',
        {
          type: 'long-fill-in',
          response: 'a',
          correct: ['{lang=en}' + 'x'.repeat(250)],
        },
        'a',
        '',
        'which this export standard reads as a delimiter',
      ],
      [
        'a fill-in answer starting with an unclosed {case_matters=',
        {
          type: 'fill-in',
          response: 'a',
          correct: ['{case_matters=true Paris'],
        },
        'a',
        '{case_matters=true Paris',
        undefined,
      ],
      [
        'a long-fill-in answer starting with an unclosed {lang=',
        { type: 'long-fill-in', response: 'a', correct: ['{lang=en Paris'] },
        'a',
        '',
        'which this export standard reads as a delimiter',
      ],
      [
        'a fill-in response starting with {lang=}',
        { type: 'fill-in', response: '{lang=en}Paris', correct: ['Paris'] },
        '',
        'Paris',
        'reads as a language tag',
      ],
      [
        'a fill-in response with a part starting with a malformed {lang=}',
        { type: 'fill-in', response: 'a[,]{lang=}x', correct: ['a'] },
        '',
        'a',
        'reads as a language tag',
      ],
      [
        'a long-fill-in response starting with an unclosed {lang=',
        { type: 'long-fill-in', response: '{lang=en Paris', correct: ['a'] },
        '',
        'a',
        'reads as a language tag',
      ],
      [
        'a step with neither name nor answer',
        { type: 'performance', response: [['', '']], correct: [['', '']] },
        '',
        '',
        'neither a name nor an answer',
      ],
      [
        'an empty choice response',
        { type: 'choice', response: [], correct: ['a'] },
        '',
        'a',
        'has no items',
      ],
      [
        'an empty sequence',
        { type: 'sequencing', response: [], correct: [] },
        '',
        '',
        'has no items',
      ],
      [
        'a fill-in response of 10 parts',
        {
          type: 'fill-in',
          response: ids(10).join('[,]'),
          correct: ['a'],
        },
        ids(10).join('[,]'),
        'a',
        undefined,
      ],
      [
        'a fill-in response of 11 parts',
        {
          type: 'fill-in',
          response: ids(11).join('[,]'),
          correct: ['a'],
        },
        '',
        'a',
        'has 11 [,]-separated parts, more than the 10',
      ],
      [
        'a fill-in answer of 11 parts',
        { type: 'fill-in', response: 'a', correct: [ids(11).join('[,]')] },
        'a',
        '',
        'more than 10 [,]-separated parts',
      ],
      [
        '36 sequence items',
        { type: 'sequencing', response: ids(36), correct: ids(36) },
        ids(36).join('[,]'),
        ids(36).join('[,]'),
        undefined,
      ],
      [
        '37 sequence items',
        { type: 'sequencing', response: ids(37), correct: ids(37) },
        '',
        '',
        'has 37 items, more than the 36',
      ],
      [
        '37 choice ids',
        { type: 'choice', response: ids(37), correct: ids(37) },
        '',
        '',
        'has 37 items, more than the 36',
      ],
      [
        '251 steps',
        {
          type: 'performance',
          response: ids(251).map((s) => [s, 'x']),
          correct: ids(251).map((s) => [s, 'x']),
        },
        '',
        '',
        'has 251 items, more than the 250',
      ],
    ] as const)(
      'records what the data model takes from %s',
      async (_label, interaction, response, pattern, warning) => {
        await start();
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        adapter.reportInteraction('q1', interaction as never, true);
        await flush();
        expect(lms.errors).toEqual([]);
        expect(lms.raw.GetValue('cmi.interactions.0.learner_response')).toBe(
          response,
        );
        expect(
          lms.raw.GetValue('cmi.interactions.0.correct_responses.0.pattern'),
        ).toBe(pattern);
        if (warning) {
          expect(warn).toHaveBeenCalledWith(expect.stringContaining(warning));
        } else {
          expect(warn).not.toHaveBeenCalled();
        }
      },
    );

    it('records an empty choice pattern', async () => {
      await start();
      adapter.reportInteraction(
        'q1',
        { type: 'choice', response: ['a'], correct: [] },
        false,
      );
      await flush();
      expect(lms.errors).toEqual([]);
      expect(
        lms.raw.GetValue('cmi.interactions.0.correct_responses._count'),
      ).toBe('1');
    });

    it('warns only that a long step answer holding a delimiter is left out', async () => {
      await start();
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      adapter.reportInteraction(
        'q1',
        {
          type: 'performance',
          response: [['s', 'a [,] b' + 'x'.repeat(300)]],
        },
        false,
      );
      await flush();
      expect(lms.errors).toEqual([]);
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('is left out of the LMS record'),
      );
    });

    describe('matching + numeric range (scorm-again 3.0.5 fix)', () => {
      it.each([
        [
          'matching',
          {
            type: 'matching',
            response: [['Phobos', 'Mars']],
            correct: [['Phobos', 'Mars']],
          },
        ],
        [
          'numeric',
          { type: 'numeric', response: 22, correct: { min: 19, max: 25 } },
        ],
      ] as const)(
        'a %s interaction is accepted by the data model',
        async (label, interaction) => {
          await start();
          adapter.reportInteraction('q1', interaction as never, true);
          await flush();
          expect(lms.errors).toEqual([]);
          expect(lms.raw.GetValue('cmi.interactions.0.type')).toBe(label);
        },
      );
    });
  });

  it('a resumed session reads prior suspend_data and continues interaction indexing', async () => {
    await start();
    const state: SavedState = {
      b: 2,
      v: [0, 1, 2],
      g: { '1': { s: 90 } },
      d: 120,
    };
    adapter.saveState(state);
    adapter.reportInteraction(
      'q1',
      { type: 'true-false', response: true, correct: true },
      true,
    );
    await flush();
    adapter.terminate();
    expect(lms.errors).toEqual([]);

    lms = relaunch2004(lms);
    const resumed = new SCORM2004Adapter(lms.api);
    await resumed.init();
    expect(resumed.getState()).toEqual(state);
    resumed.reportInteraction(
      'q2',
      { type: 'choice', response: ['a'], correct: ['a'] },
      true,
    );
    await flush();
    expect(lms.errors).toEqual([]);
    expect(lms.raw.GetValue('cmi.interactions.1.id')).toBe('q2');
  });

  it('the session_time written at exit accumulates into total_time across a relaunch', async () => {
    await start();
    adapter.setDuration(90);
    adapter.terminate();
    expect(lms.errors).toEqual([]);

    lms = relaunch2004(lms);
    await new SCORM2004Adapter(lms.api).init();
    expect(lms.raw.GetValue('cmi.total_time')).toBe('PT1M30S');
  });

  it('the wrapper has teeth: an invalid vocabulary write is flagged', async () => {
    await start();
    // Drive an out-of-vocabulary completion_status straight at the runtime to
    // prove the instrumented wrapper captures a real rejection. The adapter
    // never emits this; the always-true mock would accept it silently.
    lms.api.SetValue('cmi.completion_status', 'banana');
    expect(lms.errors.length).toBeGreaterThan(0);
    expect(lms.errors[0].key).toBe('cmi.completion_status');
  });
});
