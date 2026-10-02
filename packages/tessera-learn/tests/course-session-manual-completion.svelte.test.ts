// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import type { SavedState } from '../src/runtime/persistence.js';
import type { CourseConfig } from '../src/runtime/types.js';
import { structureFingerprint } from '../src/runtime/fingerprint.js';
import { createConfig, createManifest, flush, stubAdapter } from './helpers.js';
import { createSession } from './helpers/session.svelte.js';

const manifest = createManifest(2);

async function start(
  completion: CourseConfig['completion'],
  saved: SavedState | null = null,
) {
  const setCompletionStatus = vi.fn();
  const setSuccessStatus = vi.fn();
  const { session, progress } = createSession({
    config: createConfig({ resume: 'auto', completion }),
    manifest,
    adapter: stubAdapter({
      getState: () => saved,
      setCompletionStatus,
      setSuccessStatus,
    }),
  });
  await session.start();
  return { progress, setCompletionStatus, setSuccessStatus };
}

describe('manual completion in a CourseSession', () => {
  it('restores a manual completion saved as m: 1', async () => {
    const { progress } = await start({ mode: 'manual' }, {
      b: 0,
      v: [0],
      d: 0,
      f: structureFingerprint(manifest),
      m: 1,
    } as SavedState);

    expect(progress.toSaved().m).toBe(1);
    expect(progress.completionStatus).toBe('complete');
  });

  it('reports the requireSuccessStatus verdict with the manual completion', async () => {
    const { progress, setCompletionStatus, setSuccessStatus } = await start({
      mode: 'manual',
      requireSuccessStatus: 'passed',
    });

    progress.markCompleteManually();
    await flush();

    expect(setCompletionStatus).toHaveBeenCalledWith('complete');
    expect(setSuccessStatus).toHaveBeenCalledWith('passed');
  });

  it('reports no verdict for a manual completion without requireSuccessStatus', async () => {
    const { progress, setCompletionStatus, setSuccessStatus } = await start({
      mode: 'manual',
    });

    progress.markCompleteManually();
    await flush();

    expect(setCompletionStatus).toHaveBeenCalledWith('complete');
    expect(setSuccessStatus).not.toHaveBeenCalledWith('passed');
    expect(setSuccessStatus).not.toHaveBeenCalledWith('failed');
  });
});
