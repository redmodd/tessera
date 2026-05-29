// @vitest-environment jsdom
// SCORM 2004 adapter conformance against scorm-again. Seam: assert the
// instrumented `errors` array is empty. 2004 interaction sub-elements are
// readable, so interactions are verified by reading state back.
import { describe, it, expect, afterEach } from 'vitest';
import { SCORM2004Adapter } from '../src/runtime/adapters/scorm2004.js';
import type { SavedState } from '../src/runtime/persistence.js';
import {
  createReal2004Lms,
  relaunch2004,
  type RealLms2004,
} from './helpers/real-lms.js';

const flush = () => new Promise((r) => setTimeout(r, 50));

describe('SCORM2004Adapter against scorm-again', () => {
  let lms: RealLms2004;
  let adapter: SCORM2004Adapter;

  function start(): Promise<void> {
    lms = createReal2004Lms();
    adapter = new SCORM2004Adapter(lms.api);
    return adapter.init();
  }

  afterEach(() => lms?.dispose());

  it('a full happy-path session produces no rejected writes', async () => {
    await start();
    adapter.saveState({ b: 3, v: [0, 1, 2, 3], q: { '2': 80 }, d: 100 });
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
    const state: SavedState = { b: 4, v: [0, 1, 2, 3, 4], q: {}, d: 50 };
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
    const state: SavedState = { b: 2, v: [0, 1, 2], q: { '1': 90 }, d: 120 };
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
