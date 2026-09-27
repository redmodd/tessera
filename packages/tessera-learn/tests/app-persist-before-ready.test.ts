// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { createManifest, mountApp, stubAdapter } from './helpers.js';
import type { SavedState } from '../src/runtime/persistence.js';
import { structureFingerprint } from '../src/runtime/fingerprint.js';

const manifest = createManifest(1);

const config = {
  title: 'Demo',
  resume: 'auto',
  branding: {},
  navigation: { mode: 'free' },
  scoring: { passingScore: 80 },
  completion: { mode: 'percentage', percentageThreshold: 100 },
  export: { standard: 'web' },
};

// The layout writes through usePersistence() during init and the page never
// loads, so the flip to persistenceReady is the only thing that can flush it.
async function mountWithSlowInit(
  savedState: object | null = null,
  {
    skipLayout = false,
    layoutFixture = './fixtures/persisting-layout.svelte',
    courseConfig = config,
  } = {},
) {
  let releaseInit: () => void;
  const initGate = new Promise<void>((resolve) => {
    releaseInit = resolve;
  });
  const saveState = vi.fn();
  const commit = vi.fn();
  await mountApp({
    config: courseConfig,
    manifest,
    pageModules: {
      [manifest.pages[0].importPath]: () => new Promise(() => {}),
    },
    adapter: stubAdapter({
      init: () => initGate,
      getState: () => savedState as SavedState | null,
      saveState,
      commit,
    }),
    loadLayout: skipLayout
      ? undefined
      : () => import(/* @vite-ignore */ layoutFixture),
  });
  return { saveState, commit, releaseInit: releaseInit! };
}

describe('state changed during adapter init survives', () => {
  it('persists a write made before the adapter is ready', async () => {
    const { saveState, releaseInit } = await mountWithSlowInit();

    expect(saveState).not.toHaveBeenCalled();

    releaseInit();

    await vi.waitFor(() => {
      expect(saveState).toHaveBeenCalled();
      expect(saveState.mock.calls.at(-1)![0].u).toEqual({
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
      expect(saveState.mock.calls.at(-1)![0].u).toEqual({
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
      skipLayout: true,
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
      layoutFixture: './fixtures/completing-layout.svelte',
      courseConfig: { ...config, completion: { mode: 'manual' } },
    });

    releaseInit();

    await vi.waitFor(() => {
      expect(saveState).toHaveBeenCalled();
      expect(saveState.mock.calls.at(-1)![0].m).toBe(1);
    });
  });
});
