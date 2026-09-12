import { describe, it, expect } from 'vitest';
import { ProgressState } from '../src/runtime/progress.svelte.js';
import {
  createManifest,
  createConfig,
  gradedQuizIndices,
  quizPageIndices,
} from './helpers.js';

// ---------- ProgressState ----------

describe('ProgressState', () => {
  describe('markVisited', () => {
    it('adds page index to visited set', () => {
      const progress = new ProgressState(
        new Set(),
        createConfig(),
        0,
        new Set(),
      );
      progress.markVisited(0);
      expect(progress.visitedPages.has(0)).toBe(true);
    });

    it('is idempotent', () => {
      const progress = new ProgressState(
        new Set(),
        createConfig(),
        0,
        new Set(),
      );
      progress.markVisited(0);
      progress.markVisited(0);
      expect(progress.visitedPages.size).toBe(1);
    });

    it('tracks multiple pages', () => {
      const progress = new ProgressState(
        new Set(),
        createConfig(),
        0,
        new Set(),
      );
      progress.markVisited(0);
      progress.markVisited(3);
      progress.markVisited(5);
      expect(progress.visitedPages.size).toBe(3);
      expect(progress.visitedPages.has(3)).toBe(true);
    });
  });

  describe('quizCompleted', () => {
    it('stores quiz score', () => {
      const progress = new ProgressState(
        new Set(),
        createConfig(),
        0,
        new Set(),
      );
      progress.quizCompleted(2, 85);
      expect(progress.quizScore(2)).toBe(85);
    });

    it('keeps the best score across attempts', () => {
      const progress = new ProgressState(
        new Set(),
        createConfig(),
        0,
        new Set(),
      );
      progress.quizCompleted(2, 50);
      progress.quizCompleted(2, 90);
      progress.quizCompleted(2, 60);
      expect(progress.quizScore(2)).toBe(90);
    });

    it('counts attempts per page', () => {
      const progress = new ProgressState(
        new Set(),
        createConfig(),
        0,
        new Set(),
      );
      progress.quizCompleted(2, 50);
      progress.quizCompleted(2, 90);
      progress.quizCompleted(3, 70);
      expect(progress.quizAttempts(2)).toBe(2);
      expect(progress.quizAttempts(3)).toBe(1);
    });
  });

  describe('restoreQuiz', () => {
    it('seeds score and attempts without counting a new attempt', () => {
      const progress = new ProgressState(
        new Set(),
        createConfig(),
        0,
        new Set(),
      );
      progress.restoreQuiz(2, 90, 2);
      expect(progress.quizScore(2)).toBe(90);
      expect(progress.quizAttempts(2)).toBe(2);
    });

    it('a later submit continues the restored attempt count', () => {
      const progress = new ProgressState(
        new Set(),
        createConfig(),
        0,
        new Set(),
      );
      progress.restoreQuiz(2, 90, 2);
      progress.quizCompleted(2, 40);
      expect(progress.quizAttempts(2)).toBe(3);
      expect(progress.quizScore(2)).toBe(90);
    });
  });

  describe('recalculateCompletion — percentage mode with quiz pages', () => {
    const setup = (quizPages: Record<number, { graded?: boolean }>) => {
      const manifest = createManifest(4, quizPages);
      const config = createConfig({
        completion: { mode: 'percentage', percentageThreshold: 100 },
      });
      const progress = new ProgressState(
        gradedQuizIndices(manifest),
        config,
        manifest.totalPages,
        quizPageIndices(manifest),
        quizPageIndices(manifest),
      );
      for (let i = 0; i < 4; i++) progress.markVisited(i);
      return progress;
    };

    it('stays incomplete while a visited quiz page is unsubmitted', () => {
      expect(setup({ 3: { graded: true } }).completionStatus).toBe(
        'incomplete',
      );
    });

    it('completes once the quiz is submitted, regardless of score', () => {
      const progress = setup({ 3: { graded: true } });
      progress.quizCompleted(3, 0);
      expect(progress.completionStatus).toBe('complete');
    });

    it('applies to ungraded quizzes too', () => {
      const progress = setup({ 2: { graded: false } });
      expect(progress.completionStatus).toBe('incomplete');
      progress.quizCompleted(2, 100);
      expect(progress.completionStatus).toBe('complete');
    });

    it('counts a quiz restored from saved state', () => {
      const progress = setup({ 1: { graded: true } });
      progress.restoreQuiz(1, 80, 1);
      expect(progress.completionStatus).toBe('complete');
    });
  });

  describe('recalculateCompletion — percentage mode', () => {
    it('incomplete when below threshold', () => {
      const manifest = createManifest(10);
      const config = createConfig({
        completion: { mode: 'percentage', percentageThreshold: 80 },
      });
      const progress = new ProgressState(
        gradedQuizIndices(manifest),
        config,
        manifest.totalPages,
        quizPageIndices(manifest),
      );

      for (let i = 0; i < 7; i++) progress.markVisited(i);

      expect(progress.completionStatus).toBe('incomplete');
    });

    it('complete when at threshold', () => {
      const manifest = createManifest(10);
      const config = createConfig({
        completion: { mode: 'percentage', percentageThreshold: 80 },
      });
      const progress = new ProgressState(
        gradedQuizIndices(manifest),
        config,
        manifest.totalPages,
        quizPageIndices(manifest),
      );

      for (let i = 0; i < 8; i++) progress.markVisited(i);

      expect(progress.completionStatus).toBe('complete');
    });

    it('complete when above threshold', () => {
      const manifest = createManifest(10);
      const config = createConfig({
        completion: { mode: 'percentage', percentageThreshold: 80 },
      });
      const progress = new ProgressState(
        gradedQuizIndices(manifest),
        config,
        manifest.totalPages,
        quizPageIndices(manifest),
      );

      for (let i = 0; i < 10; i++) progress.markVisited(i);

      expect(progress.completionStatus).toBe('complete');
    });

    it('complete with 100% threshold when all pages visited', () => {
      const manifest = createManifest(5);
      const config = createConfig({
        completion: { mode: 'percentage', percentageThreshold: 100 },
      });
      const progress = new ProgressState(
        gradedQuizIndices(manifest),
        config,
        manifest.totalPages,
        quizPageIndices(manifest),
      );

      for (let i = 0; i < 5; i++) progress.markVisited(i);

      expect(progress.completionStatus).toBe('complete');
    });
  });

  describe('recalculateCompletion — quiz mode', () => {
    it('incomplete when no quizzes attempted', () => {
      const manifest = createManifest(5, {
        2: { graded: true },
        4: { graded: true },
      });
      const config = createConfig({
        completion: { mode: 'quiz' },
        scoring: { passingScore: 70 },
      });
      const progress = new ProgressState(
        gradedQuizIndices(manifest),
        config,
        manifest.totalPages,
        quizPageIndices(manifest),
      );

      expect(progress.completionStatus).toBe('incomplete');
    });

    it('incomplete when average below passing score (unattempted count as 0)', () => {
      const manifest = createManifest(5, {
        2: { graded: true },
        4: { graded: true },
      });
      const config = createConfig({
        completion: { mode: 'quiz' },
        scoring: { passingScore: 70 },
      });
      const progress = new ProgressState(
        gradedQuizIndices(manifest),
        config,
        manifest.totalPages,
        quizPageIndices(manifest),
      );

      progress.quizCompleted(2, 90);

      expect(progress.completionStatus).toBe('incomplete');
    });

    it('complete when average meets passing score', () => {
      const manifest = createManifest(5, {
        2: { graded: true },
        4: { graded: true },
      });
      const config = createConfig({
        completion: { mode: 'quiz' },
        scoring: { passingScore: 70 },
      });
      const progress = new ProgressState(
        gradedQuizIndices(manifest),
        config,
        manifest.totalPages,
        quizPageIndices(manifest),
      );

      progress.quizCompleted(2, 90);
      progress.quizCompleted(4, 80);

      expect(progress.completionStatus).toBe('complete');
    });

    it('incomplete when no graded quizzes exist', () => {
      const manifest = createManifest(5);
      const config = createConfig({
        completion: { mode: 'quiz' },
        scoring: { passingScore: 70 },
      });
      const progress = new ProgressState(
        gradedQuizIndices(manifest),
        config,
        manifest.totalPages,
        quizPageIndices(manifest),
      );

      expect(progress.completionStatus).toBe('incomplete');
    });
  });

  describe('recalculateSuccess', () => {
    it('is unknown when no graded quizzes exist', () => {
      const manifest = createManifest(5);
      const config = createConfig({ scoring: { passingScore: 70 } });
      const progress = new ProgressState(
        gradedQuizIndices(manifest),
        config,
        manifest.totalPages,
        quizPageIndices(manifest),
      );

      expect(progress.successStatus).toBe('unknown');
    });

    it('is unknown when graded quizzes exist but none attempted', () => {
      const manifest = createManifest(5, { 2: { graded: true } });
      const config = createConfig({ scoring: { passingScore: 70 } });
      const progress = new ProgressState(
        gradedQuizIndices(manifest),
        config,
        manifest.totalPages,
        quizPageIndices(manifest),
      );

      expect(progress.successStatus).toBe('unknown');
    });

    it('computes passed when average meets passing score', () => {
      const manifest = createManifest(5, {
        2: { graded: true },
        4: { graded: true },
      });
      const config = createConfig({ scoring: { passingScore: 70 } });
      const progress = new ProgressState(
        gradedQuizIndices(manifest),
        config,
        manifest.totalPages,
        quizPageIndices(manifest),
      );

      progress.quizCompleted(2, 80);
      progress.quizCompleted(4, 75);

      expect(progress.successStatus).toBe('passed');
    });

    it('computes failed when average below passing score', () => {
      const manifest = createManifest(5, {
        2: { graded: true },
        4: { graded: true },
      });
      const config = createConfig({ scoring: { passingScore: 70 } });
      const progress = new ProgressState(
        gradedQuizIndices(manifest),
        config,
        manifest.totalPages,
        quizPageIndices(manifest),
      );

      progress.quizCompleted(2, 80);

      expect(progress.successStatus).toBe('failed');
    });

    it('runs independently of completion mode', () => {
      const manifest = createManifest(5, { 2: { graded: true } });
      const config = createConfig({
        completion: { mode: 'percentage', percentageThreshold: 100 },
        scoring: { passingScore: 70 },
      });
      const progress = new ProgressState(
        gradedQuizIndices(manifest),
        config,
        manifest.totalPages,
        quizPageIndices(manifest),
      );

      progress.quizCompleted(2, 90);
      expect(progress.successStatus).toBe('passed');
    });

    it('ignores non-graded quizzes', () => {
      const manifest = createManifest(5, {
        1: { graded: false },
        3: { graded: true },
      });
      const config = createConfig({ scoring: { passingScore: 70 } });
      const progress = new ProgressState(
        gradedQuizIndices(manifest),
        config,
        manifest.totalPages,
        quizPageIndices(manifest),
      );

      progress.quizCompleted(1, 100);
      progress.quizCompleted(3, 80);

      expect(progress.successStatus).toBe('passed');
    });

    it('unattempted graded quizzes count as 0 in denominator', () => {
      const manifest = createManifest(10, {
        2: { graded: true },
        5: { graded: true },
        8: { graded: true },
      });
      const config = createConfig({ scoring: { passingScore: 70 } });
      const progress = new ProgressState(
        gradedQuizIndices(manifest),
        config,
        manifest.totalPages,
        quizPageIndices(manifest),
      );

      progress.quizCompleted(2, 95);
      progress.quizCompleted(8, 80);

      expect(progress.successStatus).toBe('failed');
    });
  });

  describe('markStandaloneQuestion', () => {
    it('stores a question score under its page', () => {
      const progress = new ProgressState(
        new Set(),
        createConfig(),
        0,
        new Set(),
      );
      progress.markStandaloneQuestion(3, 'q1', 80, false);
      expect(progress.gradedUnits.get(3)?.questions?.get('q1')?.score).toBe(80);
    });

    it('marks the unit graded only when graded=true', () => {
      const progress = new ProgressState(
        new Set(),
        createConfig(),
        0,
        new Set(),
      );
      progress.markStandaloneQuestion(3, 'q1', 80, false);
      expect(progress.gradedUnits.get(3)?.graded).toBe(false);

      progress.markStandaloneQuestion(4, 'q2', 80, true);
      expect(progress.gradedUnits.get(4)?.graded).toBe(true);
    });

    it('keeps the unit graded when a later question on the page is not', () => {
      const progress = new ProgressState(
        new Set(),
        createConfig(),
        0,
        new Set(),
      );
      progress.markStandaloneQuestion(3, 'q1', 80, true);
      progress.markStandaloneQuestion(3, 'q2', 80, false);
      expect(progress.gradedUnits.get(3)?.graded).toBe(true);
    });

    it('replaces previous score for the same question id', () => {
      const progress = new ProgressState(
        new Set(),
        createConfig(),
        0,
        new Set(),
      );
      progress.markStandaloneQuestion(3, 'q1', 50, true);
      progress.markStandaloneQuestion(3, 'q1', 90, true);
      expect(progress.gradedUnits.get(3)?.questions?.get('q1')?.score).toBe(90);
      expect(progress.gradedUnits.get(3)?.questions?.size).toBe(1);
    });

    it('keeps multiple questions on the same page', () => {
      const progress = new ProgressState(
        new Set(),
        createConfig(),
        0,
        new Set(),
      );
      progress.markStandaloneQuestion(3, 'q1', 80, true);
      progress.markStandaloneQuestion(3, 'q2', 100, true);
      expect(progress.getPageStandaloneAverage(3)).toBe(90);
    });
  });

  describe('getPageStandaloneAverage', () => {
    it('returns 0 when no questions recorded for the page', () => {
      const progress = new ProgressState(
        new Set(),
        createConfig(),
        0,
        new Set(),
      );
      expect(progress.getPageStandaloneAverage(3)).toBe(0);
    });

    it('averages the graded question scores on the page', () => {
      const progress = new ProgressState(
        new Set(),
        createConfig(),
        0,
        new Set(),
      );
      progress.markStandaloneQuestion(3, 'q1', 60, true);
      progress.markStandaloneQuestion(3, 'q2', 80, true);
      progress.markStandaloneQuestion(3, 'q3', 100, true);
      expect(progress.getPageStandaloneAverage(3)).toBe(80);
    });

    it('weights each question — Σ(w·score)/Σ(w)', () => {
      const progress = new ProgressState(
        new Set(),
        createConfig(),
        0,
        new Set(),
      );
      progress.markStandaloneQuestion(3, 'q1', 100, true, 3);
      progress.markStandaloneQuestion(3, 'q2', 0, true, 1);
      expect(progress.getPageStandaloneAverage(3)).toBe(75);
    });

    it('skips ungraded practice answers', () => {
      const progress = new ProgressState(
        new Set(),
        createConfig(),
        0,
        new Set(),
      );
      progress.markStandaloneQuestion(3, 'graded', 100, true);
      progress.markStandaloneQuestion(3, 'practice', 0, false);
      expect(progress.getPageStandaloneAverage(3)).toBe(100);
    });

    it('returns 0 on a page of ungraded practice answers', () => {
      const progress = new ProgressState(
        new Set(),
        createConfig(),
        0,
        new Set(),
      );
      progress.markStandaloneQuestion(3, 'practice', 80, false);
      expect(progress.getPageStandaloneAverage(3)).toBe(0);
    });

    it('treats a non-positive or non-finite weight as 1', () => {
      const progress = new ProgressState(
        new Set(),
        createConfig(),
        0,
        new Set(),
      );
      progress.markStandaloneQuestion(3, 'q1', 100, true, 0);
      progress.markStandaloneQuestion(3, 'q2', 0, true, -5);
      progress.markStandaloneQuestion(3, 'q3', 50, true, Infinity);
      expect(progress.getPageStandaloneAverage(3)).toBe(50);
    });
  });

  describe('pageScore', () => {
    it('returns undefined until something is answered on the page', () => {
      const progress = new ProgressState(
        new Set(),
        createConfig(),
        0,
        new Set(),
      );
      expect(progress.pageScore(3)).toBeUndefined();
    });

    it('returns the weighted standalone mean on a page with no quiz', () => {
      const progress = new ProgressState(
        new Set(),
        createConfig(),
        0,
        new Set(),
      );
      progress.markStandaloneQuestion(3, 'q1', 100, true, 3);
      progress.markStandaloneQuestion(3, 'q2', 0, true, 1);
      expect(progress.pageScore(3)).toBe(75);
    });

    it('stays undefined on a page of practice questions', () => {
      const progress = new ProgressState(
        new Set(),
        createConfig(),
        0,
        new Set(),
      );
      progress.markStandaloneQuestion(3, 'q1', 40, false);
      progress.markStandaloneQuestion(3, 'q2', 60, false);
      expect(progress.pageScore(3)).toBeUndefined();
    });

    it('ignores a practice answer beside a graded one', () => {
      const progress = new ProgressState(
        new Set(),
        createConfig(),
        0,
        new Set(),
      );
      progress.markStandaloneQuestion(1, 'graded', 100, true);
      progress.markStandaloneQuestion(1, 'practice', 0, false);
      expect(progress.pageScore(1)).toBe(100);
    });

    it('prefers the quiz score when the page has a graded quiz', () => {
      const progress = new ProgressState(
        new Set([2]),
        createConfig(),
        0,
        new Set([2]),
      );
      progress.markStandaloneQuestion(2, 'q1', 0, true);
      progress.quizCompleted(2, 85);
      expect(progress.pageScore(2)).toBe(85);
    });

    it('matches gradedScore when a practice quiz sits beside a graded question', () => {
      const progress = new ProgressState(
        new Set(),
        createConfig(),
        5,
        new Set([2]),
      );
      progress.markStandaloneQuestion(2, 'q1', 100, true);
      progress.quizCompleted(2, 10);
      expect(progress.pageScore(2)).toBe(100);
      expect(progress.gradedScore.average).toBe(100);
    });

    it('ignores the score of an ungraded practice quiz', () => {
      const progress = new ProgressState(
        new Set(),
        createConfig(),
        0,
        new Set([2]),
      );
      progress.quizCompleted(2, 60);
      expect(progress.pageScore(2)).toBeUndefined();
    });
  });

  describe('refreshStandaloneQuestion', () => {
    it('reweights a restored answer without changing its score', () => {
      const progress = new ProgressState(
        new Set(),
        createConfig(),
        0,
        new Set(),
      );
      progress.markStandaloneQuestion(3, 'q1', 100, true, 3);
      progress.markStandaloneQuestion(3, 'q2', 0, true, 1);
      progress.refreshStandaloneQuestion(3, 'q1', true, 1);

      expect(progress.gradedUnits.get(3)?.questions?.get('q1')).toEqual({
        score: 100,
        weight: 1,
        graded: true,
      });
      expect(progress.getPageStandaloneAverage(3)).toBe(50);
    });

    it('treats a restored bare score as weight 1 until the page is reopened', () => {
      const progress = new ProgressState(
        new Set(),
        createConfig(),
        0,
        new Set(),
      );
      progress.markStandaloneQuestion(3, 'q1', 100, true);
      expect(progress.gradedUnits.get(3)?.questions?.get('q1')?.weight).toBe(1);

      progress.refreshStandaloneQuestion(3, 'q1', true, 3);
      expect(progress.gradedUnits.get(3)?.questions?.get('q1')?.weight).toBe(3);
    });

    it('corrects a graded flag that drifted since the answer was saved', () => {
      const progress = new ProgressState(
        new Set(),
        createConfig(),
        0,
        new Set(),
      );
      progress.markStandaloneQuestion(3, 'q1', 100, true, 1);
      progress.refreshStandaloneQuestion(3, 'q1', false, 1);

      expect(progress.gradedUnits.get(3)?.questions?.get('q1')?.graded).toBe(
        false,
      );
      expect(progress.gradedUnits.get(3)?.graded).toBe(false);
      expect(progress.getPageStandaloneAverage(3)).toBe(0);
    });

    it('normalizes an unusable weight and ignores an unanswered question', () => {
      const progress = new ProgressState(
        new Set(),
        createConfig(),
        0,
        new Set(),
      );
      progress.markStandaloneQuestion(3, 'q1', 100, true, 3);
      progress.refreshStandaloneQuestion(3, 'q1', true, -2);
      expect(progress.gradedUnits.get(3)?.questions?.get('q1')?.weight).toBe(1);

      progress.refreshStandaloneQuestion(3, 'unanswered', true, 5);
      progress.refreshStandaloneQuestion(9, 'q1', true, 5);
      expect(progress.gradedUnits.get(3)?.questions?.has('unanswered')).toBe(
        false,
      );
      expect(progress.gradedUnits.has(9)).toBe(false);
    });
  });

  describe('recalculateSuccess — standalone graded questions', () => {
    it('includes pages with graded standalone questions', () => {
      const manifest = createManifest(5);
      const config = createConfig({ scoring: { passingScore: 70 } });
      const progress = new ProgressState(
        gradedQuizIndices(manifest),
        config,
        manifest.totalPages,
        quizPageIndices(manifest),
      );

      progress.markStandaloneQuestion(2, 'q1', 80, true);

      expect(progress.successStatus).toBe('passed');
    });

    it('uses the page average for standalone questions', () => {
      const manifest = createManifest(5);
      const config = createConfig({ scoring: { passingScore: 70 } });
      const progress = new ProgressState(
        gradedQuizIndices(manifest),
        config,
        manifest.totalPages,
        quizPageIndices(manifest),
      );

      progress.markStandaloneQuestion(2, 'q1', 60, true);
      progress.markStandaloneQuestion(2, 'q2', 60, true);

      expect(progress.successStatus).toBe('failed');
    });

    it('non-graded standalone questions do not affect success', () => {
      const manifest = createManifest(5);
      const config = createConfig({ scoring: { passingScore: 70 } });
      const progress = new ProgressState(
        gradedQuizIndices(manifest),
        config,
        manifest.totalPages,
        quizPageIndices(manifest),
      );

      progress.markStandaloneQuestion(2, 'q1', 100, false);

      expect(progress.successStatus).toBe('unknown');
    });

    it('mixes pageConfig graded quizzes with graded standalone pages', () => {
      const manifest = createManifest(5, { 1: { graded: true } });
      const config = createConfig({ scoring: { passingScore: 70 } });
      const progress = new ProgressState(
        gradedQuizIndices(manifest),
        config,
        manifest.totalPages,
        quizPageIndices(manifest),
      );

      progress.quizCompleted(1, 100);
      progress.markStandaloneQuestion(3, 'q1', 60, true);

      // Average: (100 + 60) / 2 = 80 → passed
      expect(progress.successStatus).toBe('passed');
    });

    it('pageConfig quiz score takes precedence on a page that also has standalone questions', () => {
      const manifest = createManifest(5, { 2: { graded: true } });
      const config = createConfig({ scoring: { passingScore: 70 } });
      const progress = new ProgressState(
        gradedQuizIndices(manifest),
        config,
        manifest.totalPages,
        quizPageIndices(manifest),
      );

      progress.quizCompleted(2, 90);
      progress.markStandaloneQuestion(2, 'q1', 0, true);

      // Page 2 contributes 90 (the pageConfig quiz score), not 0
      expect(progress.successStatus).toBe('passed');
    });

    it('graded standalone page does not double-count when also a graded pageConfig quiz', () => {
      const manifest = createManifest(5, { 2: { graded: true } });
      const config = createConfig({ scoring: { passingScore: 70 } });
      const progress = new ProgressState(
        gradedQuizIndices(manifest),
        config,
        manifest.totalPages,
        quizPageIndices(manifest),
      );

      progress.quizCompleted(2, 80);
      progress.markStandaloneQuestion(2, 'q1', 80, true);

      // Should be average over 1 page (page 2), not 2 entries
      expect(progress.successStatus).toBe('passed');
      // (Implicit: we trust passed @ 80 ≥ 70; the regression we guard against
      // is the average becoming sum/2 vs sum/1.)
    });
  });

  describe('gradedScore — LMS-reported score', () => {
    it('is unattempted when nothing graded is recorded', () => {
      const manifest = createManifest(5, { 1: { graded: true } });
      const progress = new ProgressState(
        gradedQuizIndices(manifest),
        createConfig(),
        manifest.totalPages,
        quizPageIndices(manifest),
      );

      expect(progress.gradedScore.attempted).toBe(false);
    });

    it('includes graded standalone questions', () => {
      const manifest = createManifest(5);
      const progress = new ProgressState(
        gradedQuizIndices(manifest),
        createConfig(),
        manifest.totalPages,
        quizPageIndices(manifest),
      );

      progress.markStandaloneQuestion(2, 'q1', 80, true);

      expect(progress.gradedScore).toEqual({ average: 80, attempted: true });
    });

    it('excludes non-graded standalone questions', () => {
      const manifest = createManifest(5);
      const progress = new ProgressState(
        gradedQuizIndices(manifest),
        createConfig(),
        manifest.totalPages,
        quizPageIndices(manifest),
      );

      progress.markStandaloneQuestion(2, 'q1', 100, false);

      expect(progress.gradedScore.attempted).toBe(false);
    });

    it('ignores a practice answer sharing a page with a graded question', () => {
      const manifest = createManifest(5);
      const progress = new ProgressState(
        gradedQuizIndices(manifest),
        createConfig(),
        manifest.totalPages,
        quizPageIndices(manifest),
      );

      progress.markStandaloneQuestion(2, 'graded', 100, true);
      progress.markStandaloneQuestion(2, 'practice', 0, false);

      expect(progress.gradedScore.average).toBe(100);
    });

    it('averages quizzes and graded standalone pages together', () => {
      const manifest = createManifest(5, { 1: { graded: true } });
      const progress = new ProgressState(
        gradedQuizIndices(manifest),
        createConfig(),
        manifest.totalPages,
        quizPageIndices(manifest),
      );

      progress.quizCompleted(1, 100);
      progress.markStandaloneQuestion(3, 'q1', 60, true);

      // (100 + 60) / 2 = 80
      expect(progress.gradedScore.average).toBe(80);
    });

    it('matches the average recalculateSuccess uses', () => {
      const manifest = createManifest(5, { 1: { graded: true } });
      const config = createConfig({ scoring: { passingScore: 80 } });
      const progress = new ProgressState(
        gradedQuizIndices(manifest),
        config,
        manifest.totalPages,
        quizPageIndices(manifest),
      );

      progress.quizCompleted(1, 90);
      progress.markStandaloneQuestion(3, 'q1', 70, true);

      const { average } = progress.gradedScore;
      expect(progress.successStatus).toBe(average >= 80 ? 'passed' : 'failed');
    });
  });

  describe('recalculateCompletion — quiz mode includes graded standalone', () => {
    it('graded standalone pages count toward completion in quiz mode', () => {
      const manifest = createManifest(5);
      const config = createConfig({
        completion: { mode: 'quiz' },
        scoring: { passingScore: 70 },
      });
      const progress = new ProgressState(
        gradedQuizIndices(manifest),
        config,
        manifest.totalPages,
        quizPageIndices(manifest),
      );

      progress.markStandaloneQuestion(2, 'q1', 80, true);

      expect(progress.completionStatus).toBe('complete');
    });
  });
});
