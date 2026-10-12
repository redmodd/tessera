// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { createConfig, createManifest, flush, stubAdapter } from './helpers.js';
import { startSession } from './helpers/session.svelte.js';
import type { ProgressState } from '../src/runtime/progress.svelte.js';
import type { SavedState } from '../src/runtime/persistence.js';
import { structureFingerprint } from '../src/runtime/fingerprint.js';

const manifest = createManifest(2, {}, { 1: { graded: true } });

function savedWith(fields: object) {
  return {
    b: 1,
    v: [0, 1],
    d: 120,
    f: structureFingerprint(manifest),
    ...fields,
  };
}

async function start(
  resume: 'auto' | 'never',
  options: {
    saved?: Partial<SavedState>;
    seeds?: boolean;
    stateLimit?: number;
  } = {},
) {
  const saved = options.saved ?? savedWith({});
  const spies = {
    seedLifecycle: vi.fn(() => options.seeds ?? true),
    setCompletionStatus: vi.fn(),
    saveState: vi.fn(),
    setScore: vi.fn(),
    setSuccessStatus: vi.fn(),
  };
  const { progress } = await startSession({
    config: createConfig({ resume, scoring: { passingScore: 80 } }),
    manifest,
    adapter: stubAdapter({
      getState: () => saved as SavedState,
      ...(options.stateLimit ? { stateLimit: options.stateLimit } : {}),
      ...spies,
    }),
  });
  return { ...spies, progress };
}

// What a page's useQuestion() calls register as it mounts.
function mountQuestion(progress: ProgressState, id: string, graded: boolean) {
  progress.registerStandaloneQuestion(1, id, graded);
  progress.pageMounted(1);
}

// shouldRestore itself is covered in fingerprint.test.ts. This covers the
// argument the session passes into it: config.resume, not a hardcoded mode.
describe('CourseSession restore gate honours config.resume', () => {
  it('restores saved state when resume is "auto"', async () => {
    const { seedLifecycle } = await start('auto');
    expect(seedLifecycle).toHaveBeenCalled();
  });

  it('restores every optional field intact', async () => {
    const saved = savedWith({
      c: { '1': 2 },
      g: { '0': { s: 80, a: 3 }, '1': { q: { q1: 100 } } },
    });
    const { saveState } = await start('auto', { saved });
    expect(saveState.mock.lastCall![0]).toMatchObject({
      v: [0, 1],
      d: 120,
      c: { '1': 2 },
      g: { '0': { s: 80, a: 3 }, '1': { q: { q1: 100 } } },
    });
  });

  it.each(['120', -120])(
    'keeps the rest of a save whose bookmark, graded record and duration (%s) are corrupted',
    async (d) => {
      const { saveState } = await start('auto', {
        saved: savedWith({ b: '1', d, g: [], c: { '1': 2 }, u: ['x'] }),
      });
      const last = saveState.mock.lastCall![0];
      expect(last).toMatchObject({ b: 0, v: [0, 1], c: { '1': 2 } });
      expect(last.g).toBeUndefined();
      expect(last.u).toBeUndefined();
      expect(last.d).toBeGreaterThanOrEqual(0);
      expect(last.d).toBeLessThan(120);
    },
  );

  it('keeps a saved completion and pass the course has since fallen below', async () => {
    const { seedLifecycle, setCompletionStatus, saveState } = await start(
      'auto',
      { saved: savedWith({ s: 1, k: 1, p: 90 }) },
    );
    expect(seedLifecycle.mock.calls[0]).toEqual(['complete', 'passed', 90]);
    expect(setCompletionStatus).toHaveBeenCalled();
    expect(setCompletionStatus).not.toHaveBeenCalledWith('incomplete');
    expect(saveState.mock.lastCall![0]).toMatchObject({ k: 1, p: 90 });
  });

  it('holds a pass the restored completion decides when the page resumed on then lowers the score', async () => {
    const { seedLifecycle, setSuccessStatus, saveState, progress } =
      await start('auto', {
        saved: savedWith({ v: [1], k: 1, g: { '1': { q: { q1: 90 } } } }),
      });

    mountQuestion(progress, 'q2', true);
    await flush();

    expect(saveState.mock.lastCall![0].g['1'].w).toEqual(['q2']);
    expect(seedLifecycle.mock.calls[0]).toEqual(['complete', 'passed', 90]);
    expect(setSuccessStatus).not.toHaveBeenCalledWith('failed');
    expect(saveState.mock.lastCall![0]).toMatchObject({ p: 90 });
  });

  it('drops a saved unanswered question the page no longer renders', async () => {
    const saved = savedWith({ g: { '1': { q: { q1: 100 }, w: ['q3'] } } });
    const { saveState, progress } = await start('auto', { saved });

    progress.pageMounted(1);
    await flush();

    expect(saveState.mock.lastCall![0].g).toEqual({
      '1': { q: { q1: 100 } },
    });
  });

  it('round-trips a weighted standalone question as [score, weight, graded], and the questions left unanswered on a page not reopened', async () => {
    const saved = savedWith({
      b: 0,
      g: { '1': { q: { q1: 100, q2: [40, 3, 1] }, w: ['q3'] } },
    });
    const { saveState } = await start('auto', { saved });
    expect(saveState.mock.lastCall![0]).toMatchObject({
      g: { '1': { q: { q1: 100, q2: [40, 3, 1] }, w: ['q3'] } },
    });
  });

  it('saves a restored answer whose question is no longer graded as ungraded', async () => {
    const { saveState, progress } = await start('auto', {
      saved: savedWith({ g: { '1': { q: { q1: 100 } } } }),
    });

    mountQuestion(progress, 'q1', false);
    await flush();

    expect(saveState.mock.lastCall![0]).toMatchObject({
      g: { '1': { q: { q1: [100, 1, 0] } } },
    });
  });

  describe('saved answers', () => {
    const essay = 'x'.repeat(120);

    async function answer(stateLimit?: number) {
      const { saveState, progress } = await start('auto', { stateLimit });
      progress.markStandaloneQuestion(1, 'q1', 100, true, 1, 1, essay);
      progress.markStandaloneQuestion(1, 'q2', 100, true, 1, 0, ['1']);
      await flush();
      return saveState.mock.lastCall![0] as SavedState;
    }

    it('are saved whole to an adapter with no limit', async () => {
      expect((await answer()).g).toEqual({
        '1': { q: { q1: [100, 1, 1, 1, essay], q2: [100, 1, 1, 0, [1]] } },
      });
    });

    it('give way where they would overrun the limit', async () => {
      const saved = await answer(180);

      expect(saved.g).toEqual({
        '1': { q: { q1: [100, 1, 1, 1], q2: [100, 1, 1, 0, [1]] } },
      });
      expect(JSON.stringify(saved).length).toBeLessThanOrEqual(180);
    });

    it('are all left out when the scores alone fill the limit', async () => {
      const bare = JSON.stringify(await answer(1)).length;

      expect((await answer(bare)).g).toEqual({
        '1': { q: { q1: [100, 1, 1, 1], q2: 100 } },
      });
    });
  });

  const scoredSave = savedWith({
    g: { '1': { q: { q1: 100, q2: [0, 2, 1] } } },
  });

  it('reports no score for a resume that only restores what was saved', async () => {
    const { saveState, seedLifecycle, setScore } = await start('auto', {
      saved: scoredSave,
    });
    expect(saveState).toHaveBeenCalled();
    expect(seedLifecycle).toHaveBeenCalledWith('complete', 'failed', 33.33);
    expect(setScore).not.toHaveBeenCalled();
  });

  it('re-reports the restored score to an adapter that does not seed', async () => {
    const { setScore } = await start('auto', {
      saved: scoredSave,
      seeds: false,
    });
    expect(setScore).toHaveBeenCalledWith(33.33);
  });

  it('ignores saved state when resume is "never"', async () => {
    const { seedLifecycle, setCompletionStatus } = await start('never');
    expect(setCompletionStatus).toHaveBeenCalled();
    expect(seedLifecycle).not.toHaveBeenCalled();
  });
});
