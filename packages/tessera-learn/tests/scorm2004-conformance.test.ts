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
      ['fill-in', 250],
      ['long-fill-in', 4000],
      ['other', 4000],
    ] as const)(
      'a %s response over %i characters is cut to fit',
      async (type, max) => {
        await start();
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        const long = 'a'.repeat(max + 1);
        const fits = 'b'.repeat(max - '{case_matters=true}'.length);
        const interaction: Interaction =
          type === 'other'
            ? { type, response: long, correct: long }
            : {
                type,
                response: long,
                correct: [long, fits + 'b', fits],
                caseMatters: type === 'fill-in',
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
    ] as const)(
      'records %s ids with spaces so the data model accepts them',
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
