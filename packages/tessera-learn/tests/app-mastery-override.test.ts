// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { createManifest, mountApp, stubAdapter } from './helpers.js';

const manifest = createManifest(1, { 0: { graded: true } });

const config = {
  title: 'Demo',
  resume: 'auto',
  branding: {},
  navigation: { mode: 'free' },
  scoring: { passingScore: 70 },
  completion: { mode: 'quiz' },
  export: { standard: 'cmi5' },
};

function mountWithMastery(masteryScore: number | undefined) {
  vi.stubGlobal('__tesseraSeenPassingScore', []);
  return mountApp({
    config,
    manifest,
    pageModules: {
      [manifest.pages[0].importPath]: () => new Promise(() => {}),
    },
    adapter: stubAdapter({ getMasteryScore: () => masteryScore ?? null }),
    loadLayout: () => import('./fixtures/mastery-layout.svelte'),
  });
}

describe('an LMS mastery override reaches a custom layout', () => {
  it('re-renders useProgress().passingScore when the override lands', async () => {
    await mountWithMastery(0.9);

    await vi.waitFor(() => {
      expect((globalThis as any).__tesseraSeenPassingScore).toContain(90);
    });
  });

  it('re-derives course status against the overridden threshold', async () => {
    await mountWithMastery(0.9);

    await vi.waitFor(() => {
      expect((globalThis as any).__tesseraSeenPassingScore).toContain(90);
    });

    const { progress, config } = (globalThis as any).__tesseraNavCtx;
    expect(config.scoring.passingScore).toBe(90);

    progress.quizCompleted(0, 80);
    expect(progress.successStatus).toBe('failed');

    progress.quizCompleted(0, 95);
    expect(progress.successStatus).toBe('passed');
  });

  it('converts the mastery score to a pass mark without float drift', async () => {
    await mountWithMastery(0.55);

    await vi.waitFor(() => {
      expect((globalThis as any).__tesseraSeenPassingScore).toContain(55);
    });

    const { progress } = (globalThis as any).__tesseraNavCtx;
    progress.quizCompleted(0, 55);
    expect(progress.successStatus).toBe('passed');
  });

  it('keeps every decimal of the mastery score in the pass mark', async () => {
    await mountWithMastery(0.5500000001);

    await vi.waitFor(() => {
      expect((globalThis as any).__tesseraSeenPassingScore).toContain(
        55.00000001,
      );
    });

    const { progress } = (globalThis as any).__tesseraNavCtx;
    progress.quizCompleted(0, 55);
    expect(progress.successStatus).toBe('failed');
  });

  it('keeps the course threshold when the LMS supplies none', async () => {
    await mountWithMastery(undefined);

    await vi.waitFor(() => {
      expect(
        (globalThis as any).__tesseraSeenPassingScore.length,
      ).toBeGreaterThan(0);
    });
    expect((globalThis as any).__tesseraSeenPassingScore).toEqual([70]);
  });
});
