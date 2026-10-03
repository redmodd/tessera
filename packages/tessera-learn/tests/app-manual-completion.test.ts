// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import type { Manifest } from '../src/plugin/manifest.js';
import type { CourseConfig } from '../src/runtime/types.js';
import {
  createConfig,
  createManifest,
  mountApp,
  navCtx,
  stubAdapter,
} from './helpers.js';

async function mount(
  completion: CourseConfig['completion'],
  manifest: Manifest,
) {
  const setCompletionStatus = vi.fn();
  const setSuccessStatus = vi.fn();
  const saveState = vi.fn();
  await mountApp({
    config: createConfig({ resume: 'auto', completion }),
    manifest,
    adapter: stubAdapter({
      setCompletionStatus,
      setSuccessStatus,
      saveState,
    }),
    loadLayout: () => import('./fixtures/mastery-layout.svelte'),
  });
  await vi.waitFor(() =>
    expect(document.body.textContent).toContain('Test page'),
  );
  return { setCompletionStatus, setSuccessStatus, saveState };
}

describe('manual completion in App', () => {
  it('completes when a completesOn: "view" page loads mid-session', async () => {
    const { setCompletionStatus, setSuccessStatus, saveState } = await mount(
      { mode: 'manual', requireSuccessStatus: 'passed' },
      createManifest(2, {}, { 1: { completesOn: 'view' } }),
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
    expect(progress.toSaved().m).toBe(1);
  });

  it('ignores completesOn outside manual mode', async () => {
    await mount(
      { mode: 'percentage', percentageThreshold: 100 },
      createManifest(2, {}, { 0: { completesOn: 'view' } }),
    );
    const { progress } = navCtx();

    expect(progress.toSaved().m).toBeUndefined();
    expect(progress.completionStatus).toBe('incomplete');
  });
});
