// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import type { Manifest } from '../src/plugin/manifest.js';
import type { SavedState } from '../src/runtime/persistence.js';
import { structureFingerprint } from '../src/runtime/fingerprint.js';
import { createManifest, mountApp, stubAdapter } from './helpers.js';

async function mount(
  completion: object,
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
  await mountApp({
    config: {
      title: 'Demo',
      resume: 'auto',
      branding: {},
      navigation: { mode: 'free' },
      completion,
      export: { standard: 'web' },
    },
    manifest,
    pageModules: Object.fromEntries(
      manifest.pages.map((p) => [
        p.importPath,
        () => import('./fixtures/app-page.svelte'),
      ]),
    ),
    adapter: stubAdapter({
      getState: () => saved,
      setCompletionStatus,
      setSuccessStatus,
    }),
    loadLayout,
  });
  await vi.waitFor(() =>
    expect(document.body.textContent).toContain('Test page'),
  );
  return {
    progress: (globalThis as any).__tesseraNavCtx?.progress,
    setCompletionStatus,
    setSuccessStatus,
  };
}

const completesOnFirstPage = createManifest(
  2,
  {},
  { 0: { completesOn: 'view' } },
);

describe('manual completion in App', () => {
  it('completes when a completesOn: "view" page loads', async () => {
    const { progress, setCompletionStatus } = await mount(
      { mode: 'manual' },
      { manifest: completesOnFirstPage },
    );

    expect(progress.manuallyCompleted).toBe(true);
    await vi.waitFor(() =>
      expect(setCompletionStatus).toHaveBeenCalledWith('complete'),
    );
  });

  it('ignores completesOn outside manual mode', async () => {
    const { progress } = await mount(
      { mode: 'percentage', percentageThreshold: 100 },
      { manifest: completesOnFirstPage },
    );

    expect(progress.manuallyCompleted).toBe(false);
    expect(progress.completionStatus).toBe('incomplete');
  });

  it('restores a manual completion saved as m: 1', async () => {
    const manifest = createManifest(2);
    const { progress } = await mount(
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
