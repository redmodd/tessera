// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import {
  createConfig,
  createManifest,
  mountApp,
  stubAdapter,
} from './helpers.js';

describe('an LMS mastery override reaches a custom layout', () => {
  it('re-renders useProgress().passingScore when the override lands', async () => {
    const seen: number[] = [];
    vi.stubGlobal('__tesseraSeenPassingScore', seen);
    await mountApp({
      config: createConfig({
        resume: 'auto',
        completion: { mode: 'quiz' },
        export: { standard: 'cmi5' },
      }),
      manifest: createManifest(1, { 0: { graded: true } }),
      adapter: stubAdapter({ getMasteryScore: () => 0.9 }),
      loadPage: () => new Promise(() => {}),
      loadLayout: () => import('./fixtures/mastery-layout.svelte'),
    });

    await vi.waitFor(() => {
      expect(seen).toContain(90);
    });
  });
});
