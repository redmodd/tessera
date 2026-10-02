// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import {
  createConfig,
  createManifest,
  mountApp,
  stubAdapter,
  useFakeTimers,
} from './helpers.js';

describe('App bounds adapter.init()', () => {
  it('surfaces an error page when init never resolves', async () => {
    useFakeTimers();
    await mountApp({
      config: createConfig({ resume: 'auto' }),
      manifest: createManifest(1),
      adapter: stubAdapter({ init: () => new Promise(() => {}) }),
    });

    expect(document.body.textContent).not.toContain('This page failed to load');

    await vi.advanceTimersByTimeAsync(20_000);
    expect(document.body.textContent).toContain('This page failed to load');
    expect(document.body.textContent).toContain('adapter init timed out');
  });
});
