import { describe, it, expect } from 'vitest';
import { ProgressState } from '../src/runtime/progress.svelte.js';
import { resolveSuccess } from '../src/runtime/types.js';
import { createManifest, createConfig } from './helpers.js';

describe('resolveSuccess', () => {
  it('implies a quiz verdict under quiz mode', () => {
    expect(resolveSuccess({ completion: { mode: 'quiz' } })).toEqual({
      from: 'quiz',
    });
  });

  it('implies a quiz verdict under percentage mode', () => {
    expect(resolveSuccess({ completion: { mode: 'percentage' } })).toEqual({
      from: 'quiz',
    });
  });

  it('implies no verdict under bare manual mode', () => {
    expect(resolveSuccess({ completion: { mode: 'manual' } })).toEqual({
      from: 'none',
    });
  });

  it('maps requireSuccessStatus onto a fixed verdict', () => {
    expect(
      resolveSuccess({
        completion: { mode: 'manual', requireSuccessStatus: 'failed' },
      }),
    ).toEqual({ from: 'fixed', status: 'failed' });
  });

  it('lets an explicit success block outrank requireSuccessStatus', () => {
    expect(
      resolveSuccess({
        completion: { mode: 'manual', requireSuccessStatus: 'passed' },
        success: { from: 'quiz' },
      }),
    ).toEqual({ from: 'quiz' });
  });

  it.each([
    { from: 'Quiz' },
    { from: 'vibes' },
    {},
    { from: 'fixed' },
    { from: 'fixed', status: 'maybe' },
  ])('resolves an unreadable criterion (%j) to no verdict', (success) => {
    expect(resolveSuccess({ success } as never)).toEqual({ from: 'none' });
  });
});

describe('success.from: "none"', () => {
  it('never sends a verdict even when the quiz average clears the bar', () => {
    const manifest = createManifest(5, { 2: { graded: true } });
    const config = createConfig({
      completion: { mode: 'percentage', percentageThreshold: 100 },
      success: { from: 'none' },
      scoring: { passingScore: 70 },
    });
    const progress = new ProgressState(manifest, config);

    progress.quizCompleted(2, 90);

    expect(progress.successStatus).toBe('unknown');
    expect(progress.gradedScore.average).toBe(90);
  });
});

describe('success.from: "quiz" under manual completion', () => {
  const build = () => {
    const manifest = createManifest(5, { 2: { graded: true } });
    const config = createConfig({
      completion: { mode: 'manual' },
      success: { from: 'quiz' },
      scoring: { passingScore: 70 },
    });
    return new ProgressState(manifest, config);
  };

  it('judges the score as soon as it is final, before the trigger', () => {
    const progress = build();

    progress.quizCompleted(2, 90);
    expect(progress.completionStatus).toBe('incomplete');
    expect(progress.successStatus).toBe('passed');

    progress.markCompleteManually();
    expect(progress.successStatus).toBe('passed');
  });

  it('reports failed for a learner who completes below the bar', () => {
    const progress = build();

    progress.quizCompleted(2, 40);
    progress.markCompleteManually();

    expect(progress.completionStatus).toBe('complete');
    expect(progress.successStatus).toBe('failed');
  });

  it('fails a learner who triggers completion without attempting a required page', () => {
    const progress = build();

    progress.markCompleteManually();

    expect(progress.completionStatus).toBe('complete');
    expect(progress.gradedScore.attempted).toBe(false);
    expect(progress.successStatus).toBe('failed');
  });

  it('reports no verdict when the only graded page was optional', () => {
    const manifest = createManifest(5, {
      2: { graded: true, required: false },
    });
    const config = createConfig({
      completion: { mode: 'manual' },
      success: { from: 'quiz' },
      scoring: { passingScore: 70 },
    });
    const progress = new ProgressState(manifest, config);

    progress.markCompleteManually();

    expect(progress.completionStatus).toBe('complete');
    expect(progress.gradedScore.attempted).toBe(false);
    expect(progress.successStatus).toBe('unknown');
  });
});

describe('success.from: "fixed"', () => {
  it('asserts the status once a percentage course completes', () => {
    const manifest = createManifest(2);
    const config = createConfig({
      completion: { mode: 'percentage', percentageThreshold: 100 },
      success: { from: 'fixed', status: 'passed' },
    });
    const progress = new ProgressState(manifest, config);

    progress.markVisited(0);
    expect(progress.successStatus).toBe('unknown');

    progress.markVisited(1);
    expect(progress.completionStatus).toBe('complete');
    expect(progress.successStatus).toBe('passed');
  });
});
