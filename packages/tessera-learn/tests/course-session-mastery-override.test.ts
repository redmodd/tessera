// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { createConfig, createManifest, stubAdapter } from './helpers.js';
import { startSession } from './helpers/session.svelte.js';

async function startWithMastery(masteryScore: number | null) {
  const { progress, config } = await startSession({
    config: createConfig({
      resume: 'auto',
      completion: { mode: 'quiz' },
      export: { standard: 'cmi5' },
    }),
    manifest: createManifest(1, { 0: { graded: true } }),
    adapter: stubAdapter({ getMasteryScore: () => masteryScore }),
  });
  return { progress, config };
}

describe('an LMS mastery override', () => {
  it('re-derives course status against the overridden threshold', async () => {
    const { progress, config } = await startWithMastery(0.9);

    expect(config.scoring.passingScore).toBe(90);

    progress.quizCompleted(0, 80);
    expect(progress.successStatus).toBe('failed');

    progress.quizCompleted(0, 95);
    expect(progress.successStatus).toBe('passed');
  });

  it('converts the mastery score to a pass mark without float drift', async () => {
    const { progress, config } = await startWithMastery(0.55);

    expect(config.scoring.passingScore).toBe(55);

    progress.quizCompleted(0, 55);
    expect(progress.successStatus).toBe('passed');
  });

  it('keeps every decimal of the mastery score in the pass mark', async () => {
    const { progress, config } = await startWithMastery(0.5500000001);

    expect(config.scoring.passingScore).toBe(55.00000001);

    progress.quizCompleted(0, 55);
    expect(progress.successStatus).toBe('failed');
  });

  it('keeps the course threshold when the LMS supplies none', async () => {
    const { config } = await startWithMastery(null);

    expect(config.scoring.passingScore).toBe(70);
  });
});
