import { describe, it, expect } from 'vitest';
import { createManifest, createConfig, gradedQuizIndices } from './helpers.js';
import {
  NavigationState,
  isPageComplete,
} from '../src/runtime/navigation.svelte.js';
import { ProgressState } from '../src/runtime/progress.svelte.js';

describe('Quiz integration with navigation gating', () => {
  it('quiz page with gatesProgress blocks next page in free mode until passed', () => {
    // Page 2 is a gating quiz
    const manifest = createManifest(5, {
      2: { graded: true, gatesProgress: true },
    });
    const config = createConfig({
      navigation: { mode: 'free' },
      scoring: { passingScore: 70 },
    });
    const progress = new ProgressState(gradedQuizIndices(manifest));
    const nav = new NavigationState(manifest, progress, config);

    // Pages 0, 1 are accessible
    expect(nav.isPageLocked(0)).toBe(false);
    expect(nav.isPageLocked(1)).toBe(false);
    expect(nav.isPageLocked(2)).toBe(false);

    // Pages 3, 4 are locked because page 2 is a gating quiz not yet passed
    expect(nav.isPageLocked(3)).toBe(true);
    expect(nav.isPageLocked(4)).toBe(true);

    // Fail the quiz
    progress.quizCompleted(2, 50);
    expect(nav.isPageLocked(3)).toBe(true);

    // Pass the quiz
    progress.quizCompleted(2, 70);
    expect(nav.isPageLocked(3)).toBe(false);
    expect(nav.isPageLocked(4)).toBe(false);
  });

  it('quiz page with gatesProgress blocks next page in sequential mode until passed', () => {
    const manifest = createManifest(4, {
      1: { graded: true, gatesProgress: true },
    });
    const config = createConfig({
      navigation: { mode: 'sequential' },
      scoring: { passingScore: 70 },
    });
    const progress = new ProgressState(gradedQuizIndices(manifest));
    const nav = new NavigationState(manifest, progress, config);

    // Visit page 0
    progress.markVisited(0);
    expect(nav.isPageLocked(1)).toBe(false);

    // Visit page 1 (quiz page) but don't complete quiz
    progress.markVisited(1);
    // Page 1 is a quiz page with gatesProgress — it needs passing score
    expect(isPageComplete(1, manifest, progress, config)).toBe(false);
    expect(nav.isPageLocked(2)).toBe(true);

    // Fail quiz
    progress.quizCompleted(1, 50);
    expect(isPageComplete(1, manifest, progress, config)).toBe(false);
    expect(nav.isPageLocked(2)).toBe(true);

    // Pass quiz
    progress.quizCompleted(1, 75);
    expect(isPageComplete(1, manifest, progress, config)).toBe(true);
    expect(nav.isPageLocked(2)).toBe(false);
  });

  it('non-gating quiz page is complete when answered regardless of score', () => {
    const manifest = createManifest(3, {
      1: { graded: true, gatesProgress: false },
    });
    const config = createConfig({ scoring: { passingScore: 70 } });
    const progress = new ProgressState(gradedQuizIndices(manifest));

    // Quiz not attempted
    expect(isPageComplete(1, manifest, progress, config)).toBe(false);

    // Quiz answered with failing score — still complete because not gating
    progress.quizCompleted(1, 30);
    expect(isPageComplete(1, manifest, progress, config)).toBe(true);
  });

  it('quiz score integrates with overall course success status', () => {
    const manifest = createManifest(5, {
      1: { graded: true, gatesProgress: false },
      3: { graded: true, gatesProgress: false },
    });
    const config = createConfig({ scoring: { passingScore: 70 } });
    const progress = new ProgressState(gradedQuizIndices(manifest));

    // No quizzes attempted yet — successStatus stays 'unknown' so we don't
    // mark a course "failed" before the learner has had a chance to start.
    // (Once *any* graded score is recorded, unattempted siblings count as 0.)
    progress.recalculateSuccess(config);
    expect(progress.successStatus).toBe('unknown');

    // One quiz completed with 90%
    progress.quizCompleted(1, 90);
    progress.recalculateSuccess(config);
    // Average = (90 + 0) / 2 = 45 (unattempted counts as 0)
    expect(progress.successStatus).toBe('failed');

    // Both quizzes completed
    progress.quizCompleted(3, 80);
    progress.recalculateSuccess(config);
    // Average = (90 + 80) / 2 = 85
    expect(progress.successStatus).toBe('passed');
  });

  it('quiz completion updates course completion in quiz mode', () => {
    const manifest = createManifest(4, {
      1: { graded: true, gatesProgress: false },
      3: { graded: true, gatesProgress: false },
    });
    const config = createConfig({
      completion: { mode: 'quiz' },
      scoring: { passingScore: 70 },
    });
    const progress = new ProgressState(gradedQuizIndices(manifest));

    progress.recalculateCompletion(manifest.totalPages, config);
    expect(progress.completionStatus).toBe('incomplete');

    // First quiz passes
    progress.quizCompleted(1, 80);
    progress.recalculateCompletion(manifest.totalPages, config);
    // Average = (80 + 0) / 2 = 40 < 70
    expect(progress.completionStatus).toBe('incomplete');

    // Second quiz passes
    progress.quizCompleted(3, 90);
    progress.recalculateCompletion(manifest.totalPages, config);
    // Average = (80 + 90) / 2 = 85 >= 70
    expect(progress.completionStatus).toBe('complete');
  });

  it('practice quiz (graded: false) does not affect success status', () => {
    const manifest = createManifest(3, {
      1: { graded: false, gatesProgress: false },
    });
    const config = createConfig({ scoring: { passingScore: 70 } });
    const progress = new ProgressState(gradedQuizIndices(manifest));

    progress.quizCompleted(1, 100);
    progress.recalculateSuccess(config);
    // No graded quizzes → unknown
    expect(progress.successStatus).toBe('unknown');
  });
});
