// @vitest-environment jsdom
// SCORM 1.2 adapter conformance against scorm-again, which validates every
// write against the real data model. Seam: assert the instrumented `errors`
// array is empty. 1.2 interaction sub-elements are write-only (404 on read),
// so they are verified via the write log + empty errors; readable elements
// are verified by reading state back.
import { describe, it, expect, afterEach } from 'vitest';
import { SCORM12Adapter } from '../src/runtime/adapters/scorm12.js';
import type { SavedState } from '../src/runtime/persistence.js';
import {
  createReal12Lms,
  relaunch12,
  writtenValues,
  type RealLms12,
} from './helpers/real-lms.js';

/** Wait for the adapter's async write queue to flush. */
const flush = () => new Promise((r) => setTimeout(r, 50));

describe('SCORM12Adapter against scorm-again', () => {
  let lms: RealLms12;
  let adapter: SCORM12Adapter;

  function start(): Promise<void> {
    lms = createReal12Lms();
    adapter = new SCORM12Adapter(lms.api);
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
    adapter.reportInteraction(
      'q1',
      { type: 'choice', response: ['a', 'b'], correct: ['a'] },
      false,
    );
    adapter.commit();
    await flush();
    expect(lms.errors).toEqual([]);
  });

  it('stores a valid score the runtime reads back', async () => {
    await start();
    adapter.setScore(85);
    await flush();
    expect(lms.errors).toEqual([]);
    expect(lms.raw.LMSGetValue('cmi.core.score.raw')).toBe('85');
    expect(lms.raw.LMSGetValue('cmi.core.score.min')).toBe('0');
    expect(lms.raw.LMSGetValue('cmi.core.score.max')).toBe('100');
  });

  it('real(10,7) rounding keeps a fractional score in the data model', async () => {
    await start();
    adapter.setScore((7 / 11) * 100);
    await flush();
    expect(lms.errors).toEqual([]);
    expect(lms.raw.LMSGetValue('cmi.core.score.raw')).toBe('63.6363636');
  });

  it('lesson_status vocabulary is accepted (completed / passed)', async () => {
    await start();
    adapter.setCompletionStatus('complete');
    adapter.setSuccessStatus('passed');
    await flush();
    expect(lms.errors).toEqual([]);
    // success takes priority over completion in lesson_status
    expect(lms.raw.LMSGetValue('cmi.core.lesson_status')).toBe('passed');
  });

  it('persists suspend_data + lesson_location the runtime reads back', async () => {
    await start();
    const state: SavedState = { b: 4, v: [0, 1, 2, 3, 4], q: {}, d: 50 };
    adapter.saveState(state);
    await flush();
    expect(lms.errors).toEqual([]);
    expect(lms.raw.LMSGetValue('cmi.suspend_data')).toBe(JSON.stringify(state));
    expect(lms.raw.LMSGetValue('cmi.core.lesson_location')).toBe('4');
  });

  it('accepts exit + session_time vocabulary', async () => {
    await start();
    adapter.setExit('suspend');
    adapter.setDuration(3661);
    await flush();
    expect(lms.errors).toEqual([]);
  });

  describe('interactions (write-only — verified via log + empty errors)', () => {
    it.each([
      [
        'choice',
        { type: 'choice', response: ['a', 'b'], correct: ['a'] },
        false,
      ],
      [
        'true-false',
        { type: 'true-false', response: true, correct: false },
        false,
      ],
      [
        'matching',
        {
          type: 'matching',
          response: [['Phobos', 'Mars']],
          correct: [['Phobos', 'Mars']],
        },
        true,
      ],
      [
        'numeric',
        { type: 'numeric', response: 22, correct: { min: 19, max: 25 } },
        true,
      ],
      ['likert', { type: 'likert', response: 'agree' }, null],
    ] as const)(
      'a %s interaction is accepted by the data model',
      async (_label, interaction, correct) => {
        await start();
        adapter.reportInteraction('q1', interaction as never, correct);
        await flush();
        expect(lms.errors).toEqual([]);
        const written = writtenValues(lms.log, 'cmi.interactions.0');
        expect(written['cmi.interactions.0.id']).toBe('q1');
        expect(written['cmi.interactions.0.type']).toBeDefined();
      },
    );
  });

  it('a resumed session reads prior suspend_data and continues interaction indexing', async () => {
    // First session: save state + report one interaction, then terminate.
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

    // Second session: a fresh runtime seeded with the persisted record, the
    // way a real LMS restores state on re-launch.
    lms = relaunch12(lms);
    const resumed = new SCORM12Adapter(lms.api);
    await resumed.init();
    expect(resumed.getState()).toEqual(state);
    // New interaction must not clobber index 0 — _count was 1, so it lands at 1.
    resumed.reportInteraction(
      'q2',
      { type: 'choice', response: ['a'], correct: ['a'] },
      true,
    );
    await flush();
    expect(lms.errors).toEqual([]);
    const written = writtenValues(lms.log, 'cmi.interactions.1');
    expect(written['cmi.interactions.1.id']).toBe('q2');
  });

  it('the wrapper has teeth: an out-of-range score is flagged', async () => {
    await start();
    // The adapter does not clamp score.raw to 0..100; 150 is out of the SCORM
    // 1.2 range and a real LMS rejects it (407). The always-true mock never
    // would. We await the retry queue draining before asserting.
    adapter.setScore(150);
    await new Promise((r) => setTimeout(r, 400));
    expect(lms.errors.some((e) => e.key === 'cmi.core.score.raw')).toBe(true);
    expect(lms.errors[0].code).toBe('407');
  });
});
