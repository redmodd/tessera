// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import {
  createConfig,
  createManifest,
  mountApp,
  stubAdapter,
} from './helpers.js';

const manifest = createManifest(1, { 0: { graded: true } });

const config = createConfig({
  resume: 'auto',
  completion: { mode: 'quiz' },
  export: { standard: 'cmi5' },
});

async function mountWithMastery(masteryScore: number | null) {
  const seen: number[] = [];
  vi.stubGlobal('__tesseraSeenPassingScore', seen);
  await mountApp({
    config,
    manifest,
    adapter: stubAdapter({ getMasteryScore: () => masteryScore }),
    loadPage: () => new Promise(() => {}),
    loadLayout: () => import('./fixtures/mastery-layout.svelte'),
  });
  return seen;
}

describe('an LMS mastery override reaches a custom layout', () => {
  it('re-renders useProgress().passingScore when the override lands', async () => {
    const seen = await mountWithMastery(0.9);

    await vi.waitFor(() => {
      expect(seen).toContain(90);
    });
  });
});
