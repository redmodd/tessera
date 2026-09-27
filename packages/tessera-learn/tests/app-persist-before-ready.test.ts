// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import type { SavedState } from '../src/runtime/persistence.js';
import { structureFingerprint } from '../src/runtime/fingerprint.js';
import {
  createConfig,
  createManifest,
  mountApp,
  stubAdapter,
} from './helpers.js';

const manifest = createManifest(1);

const config = createConfig({ resume: 'auto', scoring: { passingScore: 80 } });

// The layout writes through usePersistence() during init and the page never
// loads, so the flip to persistenceReady is the only thing that can flush it.
async function mountWithSlowInit(
  saved: Partial<SavedState> | null = null,
  {
    loadLayout = () => import('./fixtures/persisting-layout.svelte'),
    courseConfig = config,
  }: {
    loadLayout?: (() => Promise<{ default: unknown }>) | null;
    courseConfig?: typeof config;
  } = {},
) {
  const init = Promise.withResolvers<void>();
  const saveState = vi.fn();
  const commit = vi.fn();
  await mountApp({
    config: courseConfig,
    manifest,
    adapter: stubAdapter({
      init: () => init.promise,
      getState: () => saved as SavedState | null,
      saveState,
      commit,
    }),
    loadPage: () => new Promise(() => {}),
    loadLayout,
  });
  return { saveState, commit, releaseInit: init.resolve };
}

describe('state changed during adapter init survives', () => {
  it('persists a write made before the adapter is ready', async () => {
    const { saveState, releaseInit } = await mountWithSlowInit();

    expect(saveState).not.toHaveBeenCalled();

    releaseInit();

    await vi.waitFor(() => {
      expect(saveState).toHaveBeenCalled();
      expect(saveState.mock.lastCall![0].u).toEqual({
        'layout-note': 'written-before-ready',
      });
    });
  });

  it('keeps the write when a saved document is restored over it', async () => {
    const { saveState, releaseInit } = await mountWithSlowInit({
      b: 0,
      f: structureFingerprint(manifest),
      v: [0],
      d: 0,
      u: { 'other-note': 'from-a-previous-session' },
    });

    releaseInit();

    await vi.waitFor(() => {
      expect(saveState).toHaveBeenCalled();
      expect(saveState.mock.lastCall![0].u).toEqual({
        'layout-note': 'written-before-ready',
        'other-note': 'from-a-previous-session',
      });
    });
  });

  it('does not write at launch when nothing changed', async () => {
    const saved = {
      b: 0,
      f: 'stale-fingerprint',
      v: [0],
      d: 0,
      u: { 'other-note': 'from-a-previous-session' },
    };
    const { saveState, commit, releaseInit } = await mountWithSlowInit(saved, {
      loadLayout: null,
    });

    releaseInit();
    // commit() runs after the ready flip, so it lands strictly later than any
    // flush the flip could have scheduled.
    await vi.waitFor(() => expect(commit).toHaveBeenCalled());

    expect(saveState).not.toHaveBeenCalled();
  });

  it('carries a final graded score through a resume', async () => {
    const { saveState, releaseInit } = await mountWithSlowInit({
      b: 0,
      f: structureFingerprint(manifest),
      v: [0],
      d: 0,
      s: 1,
    });

    releaseInit();

    await vi.waitFor(() => {
      expect(saveState).toHaveBeenLastCalledWith(
        expect.objectContaining({ s: 1 }),
      );
    });
  });

  it('persists a completion marked before the adapter is ready', async () => {
    const { saveState, releaseInit } = await mountWithSlowInit(null, {
      loadLayout: () => import('./fixtures/completing-layout.svelte'),
      courseConfig: { ...config, completion: { mode: 'manual' } },
    });

    releaseInit();

    await vi.waitFor(() => {
      expect(saveState).toHaveBeenCalled();
      expect(saveState.mock.lastCall![0].m).toBe(1);
    });
  });
});
