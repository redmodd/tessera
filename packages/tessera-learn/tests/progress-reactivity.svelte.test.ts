// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { flushSync } from 'svelte';
import { ProgressState } from '../src/runtime/progress.svelte.js';
import { createConfig } from './helpers.js';

// The derived statuses must be read inside a tracking context, before the
// second mutation. A single read at the end passes even when the inner map
// never signals.
function trackStatuses(progress: ProgressState) {
  const seen: string[] = [];
  const cleanup = $effect.root(() => {
    $effect(() => {
      seen.push(`${progress.completionStatus}/${progress.successStatus}`);
    });
  });
  flushSync();
  return { seen, cleanup };
}

describe('standalone question rescoring re-derives course status', () => {
  const config = createConfig({
    completion: { mode: 'quiz' },
    scoring: { passingScore: 70 },
  });

  it('promotes a page whose only question is retried correctly', () => {
    const progress = new ProgressState(new Set(), config, 3);
    const { cleanup } = trackStatuses(progress);

    progress.markStandaloneQuestion(0, 'q1', 0, true);
    flushSync();
    expect(progress.successStatus).toBe('failed');

    progress.markStandaloneQuestion(0, 'q1', 100, true);
    flushSync();
    expect(progress.gradedScore().average).toBe(100);
    expect(progress.successStatus).toBe('passed');
    expect(progress.completionStatus).toBe('complete');

    cleanup();
  });

  it('demotes a page when a second question on it fails', () => {
    const progress = new ProgressState(new Set(), config, 3);
    const { cleanup } = trackStatuses(progress);

    progress.markStandaloneQuestion(0, 'q1', 100, true);
    flushSync();
    expect(progress.successStatus).toBe('passed');

    progress.markStandaloneQuestion(0, 'q2', 0, true);
    flushSync();
    expect(progress.gradedScore().average).toBe(50);
    expect(progress.successStatus).toBe('failed');
    expect(progress.completionStatus).toBe('incomplete');

    cleanup();
  });

  it('keeps gradedScore and successStatus in agreement across rescores', () => {
    const progress = new ProgressState(new Set(), config, 3);
    const { cleanup } = trackStatuses(progress);

    for (const score of [0, 100, 40, 90]) {
      progress.markStandaloneQuestion(0, 'q1', score, true);
      flushSync();
      const passing = progress.gradedScore().average >= 70;
      expect(progress.successStatus).toBe(passing ? 'passed' : 'failed');
      expect(progress.completionStatus).toBe(
        passing ? 'complete' : 'incomplete',
      );
    }

    cleanup();
  });
});
