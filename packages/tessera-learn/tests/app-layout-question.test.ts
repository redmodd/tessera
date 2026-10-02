// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import {
  createConfig,
  createManifest,
  flush,
  mountApp,
  navCtx,
  stubAdapter,
} from './helpers.js';

describe('a graded question in the layout', () => {
  it('records against no page', async () => {
    vi.stubGlobal('__showLateCheck', undefined);
    await mountApp({
      config: createConfig({
        resume: 'auto',
        completion: { mode: 'quiz' },
        export: { standard: 'xapi' },
      }),
      manifest: createManifest(1, {}, { 0: { graded: true } }),
      adapter: stubAdapter(),
      loadLayout: () => import('./fixtures/question-layout.svelte'),
    });
    await vi.waitFor(() =>
      expect(document.body.textContent).toContain('Test page'),
    );
    const { progress } = navCtx();

    (globalThis as any).__showLateCheck();
    await flush();

    expect(progress.gradedUnits.size).toBe(0);
    expect(progress.successStatus).toBe('unknown');
  });
});
