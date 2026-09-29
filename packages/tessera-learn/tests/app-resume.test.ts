// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import {
  createConfig,
  createManifest,
  mountApp,
  stubAdapter,
} from './helpers.js';
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

async function mount(
  resume: 'auto' | 'never',
  options: {
    saved?: Partial<SavedState>;
    loadPage?: () => Promise<unknown>;
    seeds?: boolean;
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
  await mountApp({
    config: createConfig({ resume, scoring: { passingScore: 80 } }),
    manifest,
    adapter: stubAdapter({
      getState: () => saved as SavedState,
      ...spies,
    }),
    loadPage: options.loadPage,
  });
  return spies;
}

// shouldRestore itself is covered in fingerprint.test.ts. This covers the
// argument App.svelte passes into it: config.resume, not a hardcoded mode.
describe('App restore gate honours config.resume', () => {
  it('restores saved state when resume is "auto"', async () => {
    const { seedLifecycle } = await mount('auto');
    await vi.waitFor(() => expect(seedLifecycle).toHaveBeenCalled());
  });

  it('restores every optional field intact', async () => {
    const saved = savedWith({
      c: { '1': 2 },
      g: { '0': { s: 80, a: 3 }, '1': { q: { q1: 100 } } },
    });
    const { saveState } = await mount('auto', { saved });
    await vi.waitFor(() => expect(saveState).toHaveBeenCalled());
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
      const { saveState } = await mount('auto', {
        saved: savedWith({ b: '1', d, g: [], c: { '1': 2 }, u: ['x'] }),
      });
      await vi.waitFor(() => expect(saveState).toHaveBeenCalled());
      const last = saveState.mock.lastCall![0];
      expect(last).toMatchObject({ b: 0, v: [0, 1], c: { '1': 2 } });
      expect(last.g).toBeUndefined();
      expect(last.u).toBeUndefined();
      expect(last.d).toBeGreaterThanOrEqual(0);
      expect(last.d).toBeLessThan(120);
    },
  );

  it('keeps a saved completion and pass the course has since fallen below', async () => {
    const { seedLifecycle, setCompletionStatus, saveState } = await mount(
      'auto',
      { saved: savedWith({ s: 1, k: 1, p: 90 }) },
    );
    await vi.waitFor(() => expect(setCompletionStatus).toHaveBeenCalled());
    await vi.waitFor(() => expect(saveState).toHaveBeenCalled());
    expect(seedLifecycle.mock.calls[0]).toEqual(['complete', 'passed', 90]);
    expect(setCompletionStatus).not.toHaveBeenCalledWith('incomplete');
    expect(saveState.mock.lastCall![0]).toMatchObject({ k: 1, p: 90 });
  });

  it('holds a pass the restored completion decides when the page resumed on then lowers the score', async () => {
    const { seedLifecycle, setSuccessStatus, saveState } = await mount('auto', {
      saved: savedWith({ v: [1], k: 1, g: { '1': { q: { q1: 90 } } } }),
      loadPage: () => import('./fixtures/app-page-graded.svelte'),
    });
    await vi.waitFor(() =>
      expect(saveState.mock.lastCall?.[0].g['1'].w).toEqual(['q2']),
    );
    expect(seedLifecycle.mock.calls[0]).toEqual(['complete', 'passed', 90]);
    expect(setSuccessStatus).not.toHaveBeenCalledWith('failed');
    expect(saveState.mock.lastCall![0]).toMatchObject({ p: 90 });
  });

  it('drops a saved unanswered question the page no longer renders', async () => {
    const saved = savedWith({ g: { '1': { q: { q1: 100 }, w: ['q3'] } } });
    const { saveState } = await mount('auto', { saved });
    await vi.waitFor(() =>
      expect(saveState.mock.lastCall?.[0].g).toEqual({
        '1': { q: { q1: 100 } },
      }),
    );
  });

  it('round-trips a weighted standalone question as [score, weight, graded], and the questions left unanswered on a page not reopened', async () => {
    const saved = savedWith({
      b: 0,
      g: { '1': { q: { q1: 100, q2: [40, 3, 1] }, w: ['q3'] } },
    });
    const { saveState } = await mount('auto', { saved });
    await vi.waitFor(() => expect(saveState).toHaveBeenCalled());
    expect(saveState.mock.lastCall![0]).toMatchObject({
      g: { '1': { q: { q1: 100, q2: [40, 3, 1] }, w: ['q3'] } },
    });
  });

  it('saves a restored answer whose question is no longer graded as ungraded', async () => {
    const { saveState } = await mount('auto', {
      saved: savedWith({ g: { '1': { q: { q1: 100 } } } }),
      loadPage: () => import('./fixtures/app-page-practice.svelte'),
    });
    await vi.waitFor(() =>
      expect(saveState.mock.lastCall?.[0]).toMatchObject({
        g: { '1': { q: { q1: [100, 1, 0] } } },
      }),
    );
  });

  const scoredSave = savedWith({
    g: { '1': { q: { q1: 100, q2: [0, 2, 1] } } },
  });

  it('reports no score for a resume that only restores what was saved', async () => {
    const { saveState, seedLifecycle, setScore } = await mount('auto', {
      saved: scoredSave,
    });
    await vi.waitFor(() => expect(saveState).toHaveBeenCalled());
    expect(seedLifecycle).toHaveBeenCalledWith('complete', 'failed', 33.33);
    expect(setScore).not.toHaveBeenCalled();
  });

  it('re-reports the restored score to an adapter that does not seed', async () => {
    const { setScore } = await mount('auto', {
      saved: scoredSave,
      seeds: false,
    });
    await vi.waitFor(() => expect(setScore).toHaveBeenCalledWith(33.33));
  });

  it('ignores saved state when resume is "never"', async () => {
    const { seedLifecycle, setCompletionStatus } = await mount('never');
    // App pushes completion status unconditionally just past the restore gate,
    // so waiting on it proves the gate ran and declined rather than that init
    // is still in flight.
    await vi.waitFor(() => expect(setCompletionStatus).toHaveBeenCalled());
    expect(seedLifecycle).not.toHaveBeenCalled();
  });
});
