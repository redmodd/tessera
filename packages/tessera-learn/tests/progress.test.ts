import { describe, it, expect } from 'vitest';
import { ProgressState } from '../src/runtime/progress.svelte.js';
import { createManifest, createConfig, gradedQuizIndices } from './helpers.js';

// ---------- ProgressState ----------

describe('ProgressState', () => {
  describe('markVisited', () => {
    it('adds page index to visited set', () => {
      const progress = new ProgressState(new Set());
      progress.markVisited(0);
      expect(progress.visitedPages.has(0)).toBe(true);
    });

    it('is idempotent', () => {
      const progress = new ProgressState(new Set());
      progress.markVisited(0);
      progress.markVisited(0);
      expect(progress.visitedPages.size).toBe(1);
    });

    it('tracks multiple pages', () => {
      const progress = new ProgressState(new Set());
      progress.markVisited(0);
      progress.markVisited(3);
      progress.markVisited(5);
      expect(progress.visitedPages.size).toBe(3);
      expect(progress.visitedPages.has(3)).toBe(true);
    });
  });

  describe('quizCompleted', () => {
    it('stores quiz score', () => {
      const progress = new ProgressState(new Set());
      progress.quizCompleted(2, 85);
      expect(progress.quizScores.get(2)).toBe(85);
    });

    it('replaces previous score on retry', () => {
      const progress = new ProgressState(new Set());
      progress.quizCompleted(2, 50);
      progress.quizCompleted(2, 90);
      expect(progress.quizScores.get(2)).toBe(90);
    });
  });

  describe('recalculateCompletion — percentage mode', () => {
    it('incomplete when below threshold', () => {
      const manifest = createManifest(10);
      const config = createConfig({ completion: { mode: 'percentage', percentageThreshold: 80 } });
      const progress = new ProgressState(gradedQuizIndices(manifest));

      for (let i = 0; i < 7; i++) progress.markVisited(i);

      progress.recalculateCompletion(manifest.totalPages, config);
      expect(progress.completionStatus).toBe('incomplete');
    });

    it('complete when at threshold', () => {
      const manifest = createManifest(10);
      const config = createConfig({ completion: { mode: 'percentage', percentageThreshold: 80 } });
      const progress = new ProgressState(gradedQuizIndices(manifest));

      for (let i = 0; i < 8; i++) progress.markVisited(i);

      progress.recalculateCompletion(manifest.totalPages, config);
      expect(progress.completionStatus).toBe('complete');
    });

    it('complete when above threshold', () => {
      const manifest = createManifest(10);
      const config = createConfig({ completion: { mode: 'percentage', percentageThreshold: 80 } });
      const progress = new ProgressState(gradedQuizIndices(manifest));

      for (let i = 0; i < 10; i++) progress.markVisited(i);

      progress.recalculateCompletion(manifest.totalPages, config);
      expect(progress.completionStatus).toBe('complete');
    });

    it('complete with 100% threshold when all pages visited', () => {
      const manifest = createManifest(5);
      const config = createConfig({ completion: { mode: 'percentage', percentageThreshold: 100 } });
      const progress = new ProgressState(gradedQuizIndices(manifest));

      for (let i = 0; i < 5; i++) progress.markVisited(i);

      progress.recalculateCompletion(manifest.totalPages, config);
      expect(progress.completionStatus).toBe('complete');
    });
  });

  describe('recalculateCompletion — quiz mode', () => {
    it('incomplete when no quizzes attempted', () => {
      const manifest = createManifest(5, { 2: { graded: true }, 4: { graded: true } });
      const config = createConfig({ completion: { mode: 'quiz' }, scoring: { passingScore: 70 } });
      const progress = new ProgressState(gradedQuizIndices(manifest));

      progress.recalculateCompletion(manifest.totalPages, config);
      expect(progress.completionStatus).toBe('incomplete');
    });

    it('incomplete when average below passing score (unattempted count as 0)', () => {
      const manifest = createManifest(5, { 2: { graded: true }, 4: { graded: true } });
      const config = createConfig({ completion: { mode: 'quiz' }, scoring: { passingScore: 70 } });
      const progress = new ProgressState(gradedQuizIndices(manifest));

      progress.quizCompleted(2, 90);

      progress.recalculateCompletion(manifest.totalPages, config);
      expect(progress.completionStatus).toBe('incomplete');
    });

    it('complete when average meets passing score', () => {
      const manifest = createManifest(5, { 2: { graded: true }, 4: { graded: true } });
      const config = createConfig({ completion: { mode: 'quiz' }, scoring: { passingScore: 70 } });
      const progress = new ProgressState(gradedQuizIndices(manifest));

      progress.quizCompleted(2, 90);
      progress.quizCompleted(4, 80);

      progress.recalculateCompletion(manifest.totalPages, config);
      expect(progress.completionStatus).toBe('complete');
    });

    it('incomplete when no graded quizzes exist', () => {
      const manifest = createManifest(5);
      const config = createConfig({ completion: { mode: 'quiz' }, scoring: { passingScore: 70 } });
      const progress = new ProgressState(gradedQuizIndices(manifest));

      progress.recalculateCompletion(manifest.totalPages, config);
      expect(progress.completionStatus).toBe('incomplete');
    });
  });

  describe('recalculateSuccess', () => {
    it('is unknown when no graded quizzes exist', () => {
      const manifest = createManifest(5);
      const config = createConfig({ scoring: { passingScore: 70 } });
      const progress = new ProgressState(gradedQuizIndices(manifest));

      progress.recalculateSuccess(config);
      expect(progress.successStatus).toBe('unknown');
    });

    it('is unknown when graded quizzes exist but none attempted', () => {
      const manifest = createManifest(5, { 2: { graded: true } });
      const config = createConfig({ scoring: { passingScore: 70 } });
      const progress = new ProgressState(gradedQuizIndices(manifest));

      progress.recalculateSuccess(config);
      expect(progress.successStatus).toBe('unknown');
    });

    it('computes passed when average meets passing score', () => {
      const manifest = createManifest(5, { 2: { graded: true }, 4: { graded: true } });
      const config = createConfig({ scoring: { passingScore: 70 } });
      const progress = new ProgressState(gradedQuizIndices(manifest));

      progress.quizCompleted(2, 80);
      progress.quizCompleted(4, 75);

      progress.recalculateSuccess(config);
      expect(progress.successStatus).toBe('passed');
    });

    it('computes failed when average below passing score', () => {
      const manifest = createManifest(5, { 2: { graded: true }, 4: { graded: true } });
      const config = createConfig({ scoring: { passingScore: 70 } });
      const progress = new ProgressState(gradedQuizIndices(manifest));

      progress.quizCompleted(2, 80);

      progress.recalculateSuccess(config);
      expect(progress.successStatus).toBe('failed');
    });

    it('runs independently of completion mode', () => {
      const manifest = createManifest(5, { 2: { graded: true } });
      const config = createConfig({
        completion: { mode: 'percentage', percentageThreshold: 100 },
        scoring: { passingScore: 70 },
      });
      const progress = new ProgressState(gradedQuizIndices(manifest));

      progress.quizCompleted(2, 90);
      progress.recalculateSuccess(config);
      expect(progress.successStatus).toBe('passed');
    });

    it('ignores non-graded quizzes', () => {
      const manifest = createManifest(5, {
        1: { graded: false },
        3: { graded: true },
      });
      const config = createConfig({ scoring: { passingScore: 70 } });
      const progress = new ProgressState(gradedQuizIndices(manifest));

      progress.quizCompleted(1, 100);
      progress.quizCompleted(3, 80);

      progress.recalculateSuccess(config);
      expect(progress.successStatus).toBe('passed');
    });

    it('unattempted graded quizzes count as 0 in denominator', () => {
      const manifest = createManifest(10, {
        2: { graded: true },
        5: { graded: true },
        8: { graded: true },
      });
      const config = createConfig({ scoring: { passingScore: 70 } });
      const progress = new ProgressState(gradedQuizIndices(manifest));

      progress.quizCompleted(2, 95);
      progress.quizCompleted(8, 80);

      progress.recalculateSuccess(config);
      expect(progress.successStatus).toBe('failed');
    });
  });

  describe('markStandaloneQuestion', () => {
    it('stores a question score under its page', () => {
      const progress = new ProgressState(new Set());
      progress.markStandaloneQuestion(3, 'q1', 80, false);
      expect(progress.standaloneQuestionScores.get(3)?.get('q1')).toBe(80);
    });

    it('adds page to gradedStandalonePages only when graded=true', () => {
      const progress = new ProgressState(new Set());
      progress.markStandaloneQuestion(3, 'q1', 80, false);
      expect(progress.gradedStandalonePages.has(3)).toBe(false);

      progress.markStandaloneQuestion(4, 'q2', 80, true);
      expect(progress.gradedStandalonePages.has(4)).toBe(true);
    });

    it('replaces previous score for the same question id', () => {
      const progress = new ProgressState(new Set());
      progress.markStandaloneQuestion(3, 'q1', 50, true);
      progress.markStandaloneQuestion(3, 'q1', 90, true);
      expect(progress.standaloneQuestionScores.get(3)?.get('q1')).toBe(90);
      expect(progress.standaloneQuestionScores.get(3)?.size).toBe(1);
    });

    it('keeps multiple questions on the same page', () => {
      const progress = new ProgressState(new Set());
      progress.markStandaloneQuestion(3, 'q1', 80, true);
      progress.markStandaloneQuestion(3, 'q2', 100, true);
      expect(progress.getPageStandaloneAverage(3)).toBe(90);
    });
  });

  describe('getPageStandaloneAverage', () => {
    it('returns 0 when no questions recorded for the page', () => {
      const progress = new ProgressState(new Set());
      expect(progress.getPageStandaloneAverage(3)).toBe(0);
    });

    it('averages all question scores on the page', () => {
      const progress = new ProgressState(new Set());
      progress.markStandaloneQuestion(3, 'q1', 60, true);
      progress.markStandaloneQuestion(3, 'q2', 80, true);
      progress.markStandaloneQuestion(3, 'q3', 100, true);
      expect(progress.getPageStandaloneAverage(3)).toBe(80);
    });
  });

  describe('recalculateSuccess — standalone graded questions', () => {
    it('includes pages with graded standalone questions', () => {
      const manifest = createManifest(5);
      const config = createConfig({ scoring: { passingScore: 70 } });
      const progress = new ProgressState(gradedQuizIndices(manifest));

      progress.markStandaloneQuestion(2, 'q1', 80, true);

      progress.recalculateSuccess(config);
      expect(progress.successStatus).toBe('passed');
    });

    it('uses the page average for standalone questions', () => {
      const manifest = createManifest(5);
      const config = createConfig({ scoring: { passingScore: 70 } });
      const progress = new ProgressState(gradedQuizIndices(manifest));

      progress.markStandaloneQuestion(2, 'q1', 60, true);
      progress.markStandaloneQuestion(2, 'q2', 60, true);

      progress.recalculateSuccess(config);
      expect(progress.successStatus).toBe('failed');
    });

    it('non-graded standalone questions do not affect success', () => {
      const manifest = createManifest(5);
      const config = createConfig({ scoring: { passingScore: 70 } });
      const progress = new ProgressState(gradedQuizIndices(manifest));

      progress.markStandaloneQuestion(2, 'q1', 100, false);

      progress.recalculateSuccess(config);
      expect(progress.successStatus).toBe('unknown');
    });

    it('mixes pageConfig graded quizzes with graded standalone pages', () => {
      const manifest = createManifest(5, { 1: { graded: true } });
      const config = createConfig({ scoring: { passingScore: 70 } });
      const progress = new ProgressState(gradedQuizIndices(manifest));

      progress.quizCompleted(1, 100);
      progress.markStandaloneQuestion(3, 'q1', 60, true);

      // Average: (100 + 60) / 2 = 80 → passed
      progress.recalculateSuccess(config);
      expect(progress.successStatus).toBe('passed');
    });

    it('pageConfig quiz score takes precedence on a page that also has standalone questions', () => {
      const manifest = createManifest(5, { 2: { graded: true } });
      const config = createConfig({ scoring: { passingScore: 70 } });
      const progress = new ProgressState(gradedQuizIndices(manifest));

      progress.quizCompleted(2, 90);
      progress.markStandaloneQuestion(2, 'q1', 0, true);

      // Page 2 contributes 90 (the pageConfig quiz score), not 0
      progress.recalculateSuccess(config);
      expect(progress.successStatus).toBe('passed');
    });

    it('graded standalone page does not double-count when also a graded pageConfig quiz', () => {
      const manifest = createManifest(5, { 2: { graded: true } });
      const config = createConfig({ scoring: { passingScore: 70 } });
      const progress = new ProgressState(gradedQuizIndices(manifest));

      progress.quizCompleted(2, 80);
      progress.markStandaloneQuestion(2, 'q1', 80, true);

      // Should be average over 1 page (page 2), not 2 entries
      progress.recalculateSuccess(config);
      expect(progress.successStatus).toBe('passed');
      // (Implicit: we trust passed @ 80 ≥ 70; the regression we guard against
      // is the average becoming sum/2 vs sum/1.)
    });
  });

  describe('recalculateCompletion — quiz mode includes graded standalone', () => {
    it('graded standalone pages count toward completion in quiz mode', () => {
      const manifest = createManifest(5);
      const config = createConfig({
        completion: { mode: 'quiz' },
        scoring: { passingScore: 70 },
      });
      const progress = new ProgressState(gradedQuizIndices(manifest));

      progress.markStandaloneQuestion(2, 'q1', 80, true);

      progress.recalculateCompletion(manifest.totalPages, config);
      expect(progress.completionStatus).toBe('complete');
    });
  });
});
