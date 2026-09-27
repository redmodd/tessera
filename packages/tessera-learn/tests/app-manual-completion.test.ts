// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import type { Manifest } from '../src/plugin/manifest.js';
import type { SavedState } from '../src/runtime/persistence.js';
import type { CourseConfig } from '../src/runtime/types.js';
import { structureFingerprint } from '../src/runtime/fingerprint.js';
import {
  createConfig,
  createManifest,
  mountApp,
  navCtx,
  stubAdapter,
} from './helpers.js';

async function mount(
  completion: CourseConfig['completion'],
  {
    manifest = createManifest(2),
    saved = null,
    loadLayout = () => import('./fixtures/mastery-layout.svelte'),
  }: {
    manifest?: Manifest;
    saved?: SavedState | null;
    loadLayout?: () => Promise<{ default: unknown }>;
  } = {},
) {
  const setCompletionStatus = vi.fn();
  const setSuccessStatus = vi.fn();
  const saveState = vi.fn();
  await mountApp({
    config: createConfig({ resume: 'auto', completion }),
    manifest,
    adapter: stubAdapter({
      getState: () => saved,
      setCompletionStatus,
      setSuccessStatus,
      saveState,
    }),
    loadLayout,
  });
  await vi.waitFor(() =>
    expect(document.body.textContent).toContain('Test page'),
  );
  return { setCompletionStatus, setSuccessStatus, saveState };
}

const completesOnFirstPage = createManifest(
  2,
  {},
  { 0: { completesOn: 'view' } },
);

describe('manual completion in App', () => {
  it('completes when a completesOn: "view" page loads mid-session', async () => {
    const { setCompletionStatus, setSuccessStatus, saveState } = await mount(
      { mode: 'manual', requireSuccessStatus: 'passed' },
      { manifest: createManifest(2, {}, { 1: { completesOn: 'view' } }) },
    );
    const { nav, progress } = navCtx();
    await vi.waitFor(() => {
      expect(setCompletionStatus).toHaveBeenCalledWith('incomplete');
      expect(saveState).toHaveBeenCalled();
    });
    expect(progress.completionStatus).toBe('incomplete');
    expect(setSuccessStatus).not.toHaveBeenCalledWith('passed');
    expect(saveState.mock.lastCall![0].m).toBeUndefined();

    nav.goToPage(1);

    await vi.waitFor(() => {
      expect(setCompletionStatus).toHaveBeenCalledWith('complete');
      expect(setSuccessStatus).toHaveBeenCalledWith('passed');
      expect(saveState.mock.lastCall![0].m).toBe(1);
    });
    expect(progress.manuallyCompleted).toBe(true);
  });

  it('ignores completesOn outside manual mode', async () => {
    await mount(
      { mode: 'percentage', percentageThreshold: 100 },
      { manifest: completesOnFirstPage },
    );
    const { progress } = navCtx();

    expect(progress.manuallyCompleted).toBe(false);
    expect(progress.completionStatus).toBe('incomplete');
  });

  it('restores a manual completion saved as m: 1', async () => {
    const manifest = createManifest(2);
    await mount(
      { mode: 'manual' },
      {
        manifest,
        saved: {
          b: 0,
          v: [0],
          d: 0,
          f: structureFingerprint(manifest),
          m: 1,
        } as SavedState,
      },
    );
    const { progress } = navCtx();

    expect(progress.manuallyCompleted).toBe(true);
    expect(progress.completionStatus).toBe('complete');
  });

  it('reports the requireSuccessStatus verdict with the manual completion', async () => {
    const { setCompletionStatus, setSuccessStatus } = await mount(
      { mode: 'manual', requireSuccessStatus: 'passed' },
      { loadLayout: () => import('./fixtures/completing-layout.svelte') },
    );

    await vi.waitFor(() =>
      expect(setCompletionStatus).toHaveBeenCalledWith('complete'),
    );
    expect(setSuccessStatus).toHaveBeenCalledWith('passed');
  });

  it('reports no verdict for a manual completion without requireSuccessStatus', async () => {
    const { setCompletionStatus, setSuccessStatus } = await mount(
      { mode: 'manual' },
      { loadLayout: () => import('./fixtures/completing-layout.svelte') },
    );

    await vi.waitFor(() =>
      expect(setCompletionStatus).toHaveBeenCalledWith('complete'),
    );
    expect(setSuccessStatus).not.toHaveBeenCalledWith('passed');
    expect(setSuccessStatus).not.toHaveBeenCalledWith('failed');
  });
});
