// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import {
  createConfig,
  createManifest,
  mountApp,
  navCtx,
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

  it('re-derives course status against the overridden threshold', async () => {
    const seen = await mountWithMastery(0.9);

    await vi.waitFor(() => {
      expect(seen).toContain(90);
    });

    const { progress, config } = navCtx();
    expect(config.scoring.passingScore).toBe(90);

    progress.quizCompleted(0, 80);
    expect(progress.successStatus).toBe('failed');

    progress.quizCompleted(0, 95);
    expect(progress.successStatus).toBe('passed');
  });

  it('converts the mastery score to a pass mark without float drift', async () => {
    const seen = await mountWithMastery(0.55);

    await vi.waitFor(() => {
      expect(seen).toContain(55);
    });

    const { progress } = navCtx();
    progress.quizCompleted(0, 55);
    expect(progress.successStatus).toBe('passed');
  });

  it('keeps every decimal of the mastery score in the pass mark', async () => {
    const seen = await mountWithMastery(0.5500000001);

    await vi.waitFor(() => {
      expect(seen).toContain(55.00000001);
    });

    const { progress } = navCtx();
    progress.quizCompleted(0, 55);
    expect(progress.successStatus).toBe('failed');
  });

  it('keeps the course threshold when the LMS supplies none', async () => {
    const seen = await mountWithMastery(null);

    await vi.waitFor(() => expect(seen).not.toHaveLength(0));
    expect(seen).toEqual([70]);
  });
});
