// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import type { SavedState } from '../src/runtime/persistence.js';
import { structureFingerprint } from '../src/runtime/fingerprint.js';
import { createConfig, createManifest, flush, stubAdapter } from './helpers.js';
import { createSession } from './helpers/session.svelte.js';

const manifest = createManifest(1);

const config = createConfig({ resume: 'auto', scoring: { passingScore: 80 } });

function startWithSlowInit(
  saved: Partial<SavedState> | null = null,
  courseConfig = config,
) {
  const init = Promise.withResolvers<void>();
  const saveState = vi.fn();
  const commit = vi.fn();
  const { session, progress } = createSession({
    config: courseConfig,
    manifest,
    adapter: stubAdapter({
      init: () => init.promise,
      getState: () => saved as SavedState | null,
      saveState,
      commit,
    }),
  });
  const started = session.start();
  async function releaseInit() {
    init.resolve();
    await started;
    await flush();
  }
  return { session, progress, saveState, commit, releaseInit };
}

describe('state changed during adapter init survives', () => {
  it('persists a write made before the adapter is ready', async () => {
    const { session, saveState, releaseInit } = startWithSlowInit();
    session.userStateStore.set('layout-note', 'written-before-ready');
    await flush();

    expect(saveState).not.toHaveBeenCalled();

    await releaseInit();

    expect(saveState.mock.lastCall![0].u).toEqual({
      'layout-note': 'written-before-ready',
    });
  });

  it('keeps the write when a saved document is restored over it', async () => {
    const { session, saveState, releaseInit } = startWithSlowInit({
      b: 0,
      f: structureFingerprint(manifest),
      v: [0],
      d: 0,
      u: { 'other-note': 'from-a-previous-session' },
    });
    session.userStateStore.set('layout-note', 'written-before-ready');

    await releaseInit();

    expect(saveState.mock.lastCall![0].u).toEqual({
      'layout-note': 'written-before-ready',
      'other-note': 'from-a-previous-session',
    });
  });

  it('does not write at launch when nothing changed', async () => {
    const { saveState, commit, releaseInit } = startWithSlowInit({
      b: 0,
      f: 'stale-fingerprint',
      v: [0],
      d: 0,
      u: { 'other-note': 'from-a-previous-session' },
    });

    await releaseInit();

    expect(commit).toHaveBeenCalled();
    expect(saveState).not.toHaveBeenCalled();
  });

  it('carries a final graded score through a resume', async () => {
    const { session, saveState, releaseInit } = startWithSlowInit({
      b: 0,
      f: structureFingerprint(manifest),
      v: [0],
      d: 0,
      s: 1,
    });
    session.userStateStore.set('layout-note', 'written-before-ready');

    await releaseInit();

    expect(saveState).toHaveBeenLastCalledWith(
      expect.objectContaining({ s: 1 }),
    );
  });

  it('persists a completion marked before the adapter is ready', async () => {
    const { progress, saveState, releaseInit } = startWithSlowInit(null, {
      ...config,
      completion: { mode: 'manual' },
    });
    progress.markCompleteManually();

    await releaseInit();

    expect(saveState.mock.lastCall![0].m).toBe(1);
  });
});

describe('CourseSession user state', () => {
  it('holds nothing under a key the object prototype defines', () => {
    const { session } = createSession();
    expect(session.userStateStore.get('constructor')).toBeNull();
  });
});
