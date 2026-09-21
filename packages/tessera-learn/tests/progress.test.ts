import { describe, it, expect } from 'vitest';
import {
  ProgressState,
  weightedScore,
} from '../src/runtime/progress.svelte.js';
import { createManifest, createConfig } from './helpers.js';

describe('weightedScore', () => {
  it('rounds to 2 decimal places, halves up despite float drift', () => {
    expect(weightedScore([{ score: 68.335, weight: 1 }])).toBe(68.34);
  });
});

// ---------- ProgressState ----------

describe('ProgressState', () => {
  describe('markVisited', () => {
    it('adds page index to visited set', () => {
      const progress = new ProgressState(createManifest(0), createConfig());
      progress.markVisited(0);
      expect(progress.visitedPages.has(0)).toBe(true);
    });

    it('is idempotent', () => {
      const progress = new ProgressState(createManifest(0), createConfig());
      progress.markVisited(0);
      progress.markVisited(0);
      expect(progress.visitedPages.size).toBe(1);
    });

    it('tracks multiple pages', () => {
      const progress = new ProgressState(createManifest(0), createConfig());
      progress.markVisited(0);
      progress.markVisited(3);
      progress.markVisited(5);
      expect(progress.visitedPages.size).toBe(3);
      expect(progress.visitedPages.has(3)).toBe(true);
    });
  });

  describe('quizCompleted', () => {
    it('stores quiz score', () => {
      const progress = new ProgressState(createManifest(0), createConfig());
      progress.quizCompleted(2, 85);
      expect(progress.quizScore(2)).toBe(85);
    });

    it('keeps the best score across attempts', () => {
      const progress = new ProgressState(createManifest(0), createConfig());
      progress.quizCompleted(2, 50);
      progress.quizCompleted(2, 90);
      progress.quizCompleted(2, 60);
      expect(progress.quizScore(2)).toBe(90);
    });

    it('counts attempts per page', () => {
      const progress = new ProgressState(createManifest(0), createConfig());
      progress.quizCompleted(2, 50);
      progress.quizCompleted(2, 90);
      progress.quizCompleted(3, 70);
      expect(progress.quizAttempts(2)).toBe(2);
      expect(progress.quizAttempts(3)).toBe(1);
    });
  });

  describe('restoreQuiz', () => {
    it('seeds score and attempts without counting a new attempt', () => {
      const progress = new ProgressState(createManifest(0), createConfig());
      progress.restoreQuiz(2, 90, 2);
      expect(progress.quizScore(2)).toBe(90);
      expect(progress.quizAttempts(2)).toBe(2);
    });

    it('a later submit continues the restored attempt count', () => {
      const progress = new ProgressState(createManifest(0), createConfig());
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
      const progress = new ProgressState(manifest, config);
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

  describe('recalculateCompletion — percentage mode with declared graded pages', () => {
    const setup = () => {
      const progress = new ProgressState(
        createManifest(4, {}, { 3: { graded: true } }),
        createConfig({
          completion: { mode: 'percentage', percentageThreshold: 100 },
        }),
      );
      for (let i = 0; i < 4; i++) progress.markVisited(i);
      return progress;
    };

    it('stays incomplete while a visited graded page is unanswered', () => {
      expect(setup().completionStatus).toBe('incomplete');
    });

    it('completes once the graded page is answered, regardless of score', () => {
      const progress = setup();
      progress.markStandaloneQuestion(3, 'q1', 0, true);
      expect(progress.completionStatus).toBe('complete');
    });

    it('ignores a practice answer on the graded page', () => {
      const progress = setup();
      progress.markStandaloneQuestion(3, 'q1', 100, false);
      expect(progress.completionStatus).toBe('incomplete');
    });

    it('holds a declared graded page carrying a practice quiz', () => {
      const progress = new ProgressState(
        createManifest(4, { 3: { graded: false } }, { 3: { graded: true } }),
        createConfig({
          completion: { mode: 'percentage', percentageThreshold: 100 },
        }),
      );
      for (let i = 0; i < 4; i++) progress.markVisited(i);
      progress.quizCompleted(3, 100);
      expect(progress.completionStatus).toBe('incomplete');
      progress.markStandaloneQuestion(3, 'q1', 0, true);
      expect(progress.completionStatus).toBe('complete');
    });
  });

  describe('recalculateCompletion — percentage mode', () => {
    it('incomplete when below threshold', () => {
      const manifest = createManifest(10);
      const config = createConfig({
        completion: { mode: 'percentage', percentageThreshold: 80 },
      });
      const progress = new ProgressState(manifest, config);

      for (let i = 0; i < 7; i++) progress.markVisited(i);

      expect(progress.completionStatus).toBe('incomplete');
    });

    it('complete when at threshold', () => {
      const manifest = createManifest(10);
      const config = createConfig({
        completion: { mode: 'percentage', percentageThreshold: 80 },
      });
      const progress = new ProgressState(manifest, config);

      for (let i = 0; i < 8; i++) progress.markVisited(i);

      expect(progress.completionStatus).toBe('complete');
    });

    it('complete when above threshold', () => {
      const manifest = createManifest(10);
      const config = createConfig({
        completion: { mode: 'percentage', percentageThreshold: 80 },
      });
      const progress = new ProgressState(manifest, config);

      for (let i = 0; i < 10; i++) progress.markVisited(i);

      expect(progress.completionStatus).toBe('complete');
    });

    it('complete with 100% threshold when all pages visited', () => {
      const manifest = createManifest(5);
      const config = createConfig({
        completion: { mode: 'percentage', percentageThreshold: 100 },
      });
      const progress = new ProgressState(manifest, config);

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
      const progress = new ProgressState(manifest, config);

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
      const progress = new ProgressState(manifest, config);

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
      const progress = new ProgressState(manifest, config);

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
      const progress = new ProgressState(manifest, config);

      expect(progress.completionStatus).toBe('incomplete');
    });
  });

  describe('recalculateSuccess', () => {
    it('is unknown when no graded quizzes exist', () => {
      const manifest = createManifest(5);
      const config = createConfig({ scoring: { passingScore: 70 } });
      const progress = new ProgressState(manifest, config);

      expect(progress.successStatus).toBe('unknown');
    });

    it('is unknown when graded quizzes exist but none attempted', () => {
      const manifest = createManifest(5, { 2: { graded: true } });
      const config = createConfig({ scoring: { passingScore: 70 } });
      const progress = new ProgressState(manifest, config);

      expect(progress.successStatus).toBe('unknown');
    });

    it('computes passed when average meets passing score', () => {
      const manifest = createManifest(5, {
        2: { graded: true },
        4: { graded: true },
      });
      const config = createConfig({
        completion: { mode: 'quiz' },
        scoring: { passingScore: 70 },
      });
      const progress = new ProgressState(manifest, config);

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
      const progress = new ProgressState(manifest, config);

      progress.quizCompleted(2, 80);
      progress.quizCompleted(4, 50);

      expect(progress.successStatus).toBe('failed');
    });

    it('stays unknown while a graded page is unscored', () => {
      const manifest = createManifest(5, {
        2: { graded: true },
        4: { graded: true },
      });
      const config = createConfig({ scoring: { passingScore: 70 } });
      const progress = new ProgressState(manifest, config);

      progress.quizCompleted(2, 80);

      expect(progress.successStatus).toBe('unknown');
      expect(progress.gradedScoreFinal).toBe(false);
      expect(progress.gradedScore).toEqual({ average: 40, attempted: true });
    });

    it('decides once completion is reached, counting unscored graded pages as 0', () => {
      const manifest = createManifest(5, {
        2: { graded: true },
        4: { graded: true },
      });
      const config = createConfig({
        completion: { mode: 'percentage', percentageThreshold: 80 },
        scoring: { passingScore: 70 },
      });
      const progress = new ProgressState(manifest, config);

      progress.quizCompleted(2, 80);
      for (const i of [0, 1, 2]) progress.markVisited(i);
      expect(progress.successStatus).toBe('unknown');

      progress.markVisited(3);
      expect(progress.completionStatus).toBe('complete');
      expect(progress.gradedScoreFinal).toBe(true);
      expect(progress.successStatus).toBe('failed');
    });

    it('stays unknown on completion when the course has no graded pages', () => {
      const progress = new ProgressState(
        createManifest(2),
        createConfig({
          completion: { mode: 'percentage', percentageThreshold: 50 },
        }),
      );

      progress.markVisited(0);

      expect(progress.completionStatus).toBe('complete');
      expect(progress.gradedScoreFinal).toBe(false);
      expect(progress.successStatus).toBe('unknown');
    });

    it('holds a pass until the course completes', () => {
      const manifest = createManifest(5, { 2: { graded: true } });
      const progress = new ProgressState(manifest, createConfig());

      progress.quizCompleted(2, 90);
      expect(progress.gradedScoreFinal).toBe(true);
      expect(progress.successStatus).toBe('unknown');

      for (let i = 0; i < 5; i++) progress.markVisited(i);
      expect(progress.successStatus).toBe('passed');
    });

    it('ignores non-graded quizzes', () => {
      const manifest = createManifest(5, {
        1: { graded: false },
        3: { graded: true },
      });
      const config = createConfig({
        completion: { mode: 'quiz' },
        scoring: { passingScore: 70 },
      });
      const progress = new ProgressState(manifest, config);

      progress.quizCompleted(1, 100);
      progress.quizCompleted(3, 80);

      expect(progress.successStatus).toBe('passed');
    });

    it('decides once the last graded quiz is scored', () => {
      const manifest = createManifest(10, {
        2: { graded: true },
        5: { graded: true },
        8: { graded: true },
      });
      const config = createConfig({ scoring: { passingScore: 70 } });
      const progress = new ProgressState(manifest, config);

      progress.quizCompleted(2, 95);
      progress.quizCompleted(8, 80);
      expect(progress.successStatus).toBe('unknown');

      progress.quizCompleted(5, 0);
      expect(progress.gradedScoreFinal).toBe(true);
      expect(progress.successStatus).toBe('failed');
    });

    const threeGradedPages = () =>
      new ProgressState(
        createManifest(
          4,
          {},
          { 1: { graded: true }, 2: { graded: true }, 3: { graded: true } },
        ),
        createConfig({
          completion: { mode: 'quiz' },
          scoring: { passingScore: 60 },
        }),
      );

    it('keeps following the score after a changed answer undoes completion, but holds the reported completion and pass', () => {
      const progress = threeGradedPages();

      progress.markStandaloneQuestion(1, 'q1', 100, true);
      progress.markStandaloneQuestion(2, 'q1', 100, true);
      expect(progress.completionStatus).toBe('complete');
      expect(progress.successStatus).toBe('passed');

      progress.markStandaloneQuestion(2, 'q1', 0, true);

      expect(progress.completionStatus).toBe('incomplete');
      expect(progress.reportedCompletionStatus).toBe('complete');
      expect(progress.gradedScoreFinal).toBe(true);
      expect(progress.successStatus).toBe('passed');
    });

    it('restores a final graded score from a previous session', () => {
      const progress = threeGradedPages();

      progress.markStandaloneQuestion(1, 'q1', 100, true);
      progress.markStandaloneQuestion(2, 'q1', 0, true);
      expect(progress.gradedScoreFinal).toBe(false);

      progress.restoreLatches({
        decided: true,
        completed: false,
        passScore: null,
      });

      expect(progress.gradedScoreFinal).toBe(true);
      expect(progress.successStatus).toBe('failed');
    });
  });

  describe('markStandaloneQuestion', () => {
    it('stores a question score under its page', () => {
      const progress = new ProgressState(createManifest(0), createConfig());
      progress.markStandaloneQuestion(3, 'q1', 80, false);
      expect(progress.gradedUnits.get(3)?.questions?.get('q1')?.score).toBe(80);
    });

    it('replaces previous score for the same question id', () => {
      const progress = new ProgressState(createManifest(0), createConfig());
      progress.markStandaloneQuestion(3, 'q1', 50, true);
      progress.markStandaloneQuestion(3, 'q1', 90, true);
      expect(progress.gradedUnits.get(3)?.questions?.get('q1')?.score).toBe(90);
      expect(progress.gradedUnits.get(3)?.questions?.size).toBe(1);
    });

    it('keeps multiple questions on the same page', () => {
      const progress = new ProgressState(createManifest(0), createConfig());
      progress.markStandaloneQuestion(3, 'q1', 80, true);
      progress.markStandaloneQuestion(3, 'q2', 100, true);
      expect(progress.getPageStandaloneAverage(3)).toBe(90);
    });
  });

  describe('getPageStandaloneAverage', () => {
    it('returns 0 when no questions recorded for the page', () => {
      const progress = new ProgressState(createManifest(0), createConfig());
      expect(progress.getPageStandaloneAverage(3)).toBe(0);
    });

    it('averages the graded question scores on the page', () => {
      const progress = new ProgressState(createManifest(0), createConfig());
      progress.markStandaloneQuestion(3, 'q1', 60, true);
      progress.markStandaloneQuestion(3, 'q2', 80, true);
      progress.markStandaloneQuestion(3, 'q3', 100, true);
      expect(progress.getPageStandaloneAverage(3)).toBe(80);
    });

    it('weights each question, Σ(w·score)/Σ(w), to 2 decimal places', () => {
      const progress = new ProgressState(createManifest(0), createConfig());
      progress.markStandaloneQuestion(3, 'q1', 100, true, 2);
      progress.markStandaloneQuestion(3, 'q2', 0, true, 1);
      expect(progress.getPageStandaloneAverage(3)).toBe(66.67);
    });

    it('skips ungraded practice answers', () => {
      const progress = new ProgressState(createManifest(0), createConfig());
      progress.markStandaloneQuestion(3, 'graded', 100, true);
      progress.markStandaloneQuestion(3, 'practice', 0, false);
      expect(progress.getPageStandaloneAverage(3)).toBe(100);
    });

    it('returns 0 on a page of ungraded practice answers', () => {
      const progress = new ProgressState(createManifest(0), createConfig());
      progress.markStandaloneQuestion(3, 'practice', 80, false);
      expect(progress.getPageStandaloneAverage(3)).toBe(0);
    });

    it('treats a non-positive or non-finite weight as 1', () => {
      const progress = new ProgressState(createManifest(0), createConfig());
      progress.markStandaloneQuestion(3, 'q1', 100, true, 0);
      progress.markStandaloneQuestion(3, 'q2', 0, true, -5);
      progress.markStandaloneQuestion(3, 'q3', 50, true, Infinity);
      expect(progress.getPageStandaloneAverage(3)).toBe(50);
    });
  });

  describe('pageScore', () => {
    it('returns undefined until something is answered on the page', () => {
      const progress = new ProgressState(createManifest(0), createConfig());
      expect(progress.pageScore(3)).toBeUndefined();
    });

    it('returns the weighted standalone mean on a page with no quiz', () => {
      const progress = new ProgressState(createManifest(0), createConfig());
      progress.markStandaloneQuestion(3, 'q1', 100, true, 3);
      progress.markStandaloneQuestion(3, 'q2', 0, true, 1);
      expect(progress.pageScore(3)).toBe(75);
    });

    it('stays undefined on a page of practice questions', () => {
      const progress = new ProgressState(createManifest(0), createConfig());
      progress.markStandaloneQuestion(3, 'q1', 40, false);
      progress.markStandaloneQuestion(3, 'q2', 60, false);
      expect(progress.pageScore(3)).toBeUndefined();
    });

    it('ignores a practice answer beside a graded one', () => {
      const progress = new ProgressState(createManifest(0), createConfig());
      progress.markStandaloneQuestion(1, 'graded', 100, true);
      progress.markStandaloneQuestion(1, 'practice', 0, false);
      expect(progress.pageScore(1)).toBe(100);
    });

    it('prefers the quiz score when the page has a graded quiz', () => {
      const progress = new ProgressState(
        createManifest(5, { 2: { graded: true } }),
        createConfig(),
      );
      progress.markStandaloneQuestion(2, 'q1', 0, true);
      progress.quizCompleted(2, 85);
      expect(progress.pageScore(2)).toBe(85);
    });

    it('ignores a practice quiz on a page that declares graded: true', () => {
      const progress = new ProgressState(
        createManifest(5, { 2: {} }, { 2: { graded: true } }),
        createConfig(),
      );
      progress.markStandaloneQuestion(2, 'q1', 100, true);
      progress.quizCompleted(2, 10);
      expect(progress.pageScore(2)).toBe(100);
    });

    it('matches gradedScore when a practice quiz sits beside a graded question', () => {
      const progress = new ProgressState(
        createManifest(5, { 2: {} }, { 2: { graded: true } }),
        createConfig(),
      );
      progress.markStandaloneQuestion(2, 'q1', 100, true);
      progress.quizCompleted(2, 10);
      expect(progress.pageScore(2)).toBe(100);
      expect(progress.gradedScore.average).toBe(100);
    });

    it('ignores the score of an ungraded practice quiz', () => {
      const progress = new ProgressState(
        createManifest(5, { 2: {} }),
        createConfig(),
      );
      progress.quizCompleted(2, 60);
      expect(progress.pageScore(2)).toBeUndefined();
    });
  });

  describe('registerStandaloneQuestion', () => {
    it('reweights a restored answer without changing its score', () => {
      const progress = new ProgressState(createManifest(0), createConfig());
      progress.markStandaloneQuestion(3, 'q1', 100, true, 3);
      progress.markStandaloneQuestion(3, 'q2', 0, true, 1);
      progress.registerStandaloneQuestion(3, 'q1', true, 1);

      expect(progress.gradedUnits.get(3)?.questions?.get('q1')).toEqual({
        score: 100,
        weight: 1,
        graded: true,
      });
      expect(progress.getPageStandaloneAverage(3)).toBe(50);
    });

    it('treats a restored bare score as weight 1 until the page is reopened', () => {
      const progress = new ProgressState(createManifest(0), createConfig());
      progress.markStandaloneQuestion(3, 'q1', 100, true);
      expect(progress.gradedUnits.get(3)?.questions?.get('q1')?.weight).toBe(1);

      progress.registerStandaloneQuestion(3, 'q1', true, 3);
      expect(progress.gradedUnits.get(3)?.questions?.get('q1')?.weight).toBe(3);
    });

    it('corrects a graded flag that drifted since the answer was saved', () => {
      const progress = new ProgressState(createManifest(0), createConfig());
      progress.markStandaloneQuestion(3, 'q1', 100, true, 1);
      progress.registerStandaloneQuestion(3, 'q1', false, 1);

      expect(progress.gradedUnits.get(3)?.questions?.get('q1')?.graded).toBe(
        false,
      );
      expect(progress.pageScore(3)).toBeUndefined();
    });

    it('normalizes an unusable weight and ignores an unanswered question', () => {
      const progress = new ProgressState(createManifest(0), createConfig());
      progress.markStandaloneQuestion(3, 'q1', 100, true, 3);
      progress.registerStandaloneQuestion(3, 'q1', true, -2);
      expect(progress.gradedUnits.get(3)?.questions?.get('q1')?.weight).toBe(1);

      progress.registerStandaloneQuestion(3, 'unanswered', true, 5);
      progress.registerStandaloneQuestion(9, 'q1', true, 5);
      expect(progress.gradedUnits.get(3)?.questions?.has('unanswered')).toBe(
        false,
      );
      expect(progress.gradedUnits.has(9)).toBe(false);
    });
  });

  describe('pages answered question by question', () => {
    const onePage = () => {
      const progress = new ProgressState(
        createManifest(1, {}, { 0: { graded: true } }),
        createConfig(),
      );
      progress.registerStandaloneQuestion(0, 'q-heavy', true, 3);
      progress.registerStandaloneQuestion(0, 'q-light', true, 1);
      progress.registerStandaloneQuestion(0, 'q-practice', false);
      progress.markVisited(0);
      return progress;
    };

    it('holds completion, the score and the pass until every graded question is answered', () => {
      const progress = onePage();

      progress.markStandaloneQuestion(0, 'q-heavy', 100, true, 3);

      expect(progress.pageScore(0)).toBe(100);
      expect(progress.awaitingScore(0)).toBe(true);
      expect(progress.completionStatus).toBe('incomplete');
      expect(progress.gradedScoreFinal).toBe(false);
      expect(progress.successStatus).toBe('unknown');

      progress.markStandaloneQuestion(0, 'q-light', 0, true, 1);

      expect(progress.completionStatus).toBe('complete');
      expect(progress.successStatus).toBe('passed');
      expect(progress.reportedScore).toBe(75);
    });

    it('carries the unanswered questions across a resume', () => {
      const saved = onePage();
      saved.markStandaloneQuestion(0, 'q-heavy', 100, true, 3);
      expect(saved.unansweredQuestions(0)).toEqual(['q-light']);

      const progress = new ProgressState(
        createManifest(1, {}, { 0: { graded: true } }),
        createConfig(),
      );
      progress.replay(() => {
        progress.markVisited(0);
        progress.restoreUnanswered(0, saved.unansweredQuestions(0));
        progress.markStandaloneQuestion(0, 'q-heavy', 100, true, 3);
      });

      expect(progress.unansweredQuestions(0)).toEqual(['q-light']);
      expect(progress.awaitingScore(0)).toBe(true);
      expect(progress.completionStatus).toBe('incomplete');
    });

    it('drops a restored question the page no longer registers once it mounts', () => {
      const progress = new ProgressState(
        createManifest(1, {}, { 0: { graded: true } }),
        createConfig(),
      );
      progress.replay(() => {
        progress.markVisited(0);
        progress.restoreUnanswered(0, ['q-light', 'q-removed']);
        progress.markStandaloneQuestion(0, 'q-heavy', 100, true, 3);
      });
      progress.registerStandaloneQuestion(0, 'q-heavy', true, 3);
      progress.registerStandaloneQuestion(0, 'q-light', true, 1);
      progress.pageMounted(0);

      expect(progress.unansweredQuestions(0)).toEqual(['q-light']);

      progress.markStandaloneQuestion(0, 'q-light', 0, true, 1);

      expect(progress.completionStatus).toBe('complete');
    });
  });

  describe('recalculateSuccess — standalone graded questions', () => {
    it('includes pages with graded standalone questions', () => {
      const manifest = createManifest(5, {}, { 2: { graded: true } });
      const config = createConfig({
        completion: { mode: 'quiz' },
        scoring: { passingScore: 70 },
      });
      const progress = new ProgressState(manifest, config);

      progress.markStandaloneQuestion(2, 'q1', 80, true);

      expect(progress.successStatus).toBe('passed');
    });

    it('uses the page average for standalone questions', () => {
      const manifest = createManifest(5, {}, { 2: { graded: true } });
      const config = createConfig({ scoring: { passingScore: 70 } });
      const progress = new ProgressState(manifest, config);

      progress.markStandaloneQuestion(2, 'q1', 60, true);
      progress.markStandaloneQuestion(2, 'q2', 60, true);

      expect(progress.successStatus).toBe('failed');
    });

    it('non-graded standalone questions do not affect success', () => {
      const manifest = createManifest(5);
      const config = createConfig({ scoring: { passingScore: 70 } });
      const progress = new ProgressState(manifest, config);

      progress.markStandaloneQuestion(2, 'q1', 100, false);

      expect(progress.successStatus).toBe('unknown');
    });

    it('mixes pageConfig graded quizzes with graded standalone pages', () => {
      const manifest = createManifest(
        5,
        { 1: { graded: true } },
        { 3: { graded: true } },
      );
      const config = createConfig({
        completion: { mode: 'quiz' },
        scoring: { passingScore: 70 },
      });
      const progress = new ProgressState(manifest, config);

      progress.quizCompleted(1, 100);
      progress.markStandaloneQuestion(3, 'q1', 60, true);

      // Average: (100 + 60) / 2 = 80 → passed
      expect(progress.successStatus).toBe('passed');
    });

    it('pageConfig quiz score takes precedence on a page that also has standalone questions', () => {
      const manifest = createManifest(5, { 2: { graded: true } });
      const config = createConfig({
        completion: { mode: 'quiz' },
        scoring: { passingScore: 70 },
      });
      const progress = new ProgressState(manifest, config);

      progress.quizCompleted(2, 90);
      progress.markStandaloneQuestion(2, 'q1', 0, true);

      // Page 2 contributes 90 (the pageConfig quiz score), not 0
      expect(progress.successStatus).toBe('passed');
    });

    it('graded standalone page does not double-count when also a graded pageConfig quiz', () => {
      const manifest = createManifest(5, { 2: { graded: true } });
      const config = createConfig({
        completion: { mode: 'quiz' },
        scoring: { passingScore: 70 },
      });
      const progress = new ProgressState(manifest, config);

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
      const progress = new ProgressState(manifest, createConfig());

      expect(progress.gradedScore.attempted).toBe(false);
    });

    it('includes graded standalone questions', () => {
      const manifest = createManifest(5, {}, { 2: { graded: true } });
      const progress = new ProgressState(manifest, createConfig());

      progress.markStandaloneQuestion(2, 'q1', 80, true);

      expect(progress.gradedScore).toEqual({ average: 80, attempted: true });
    });

    it('excludes non-graded standalone questions', () => {
      const manifest = createManifest(5);
      const progress = new ProgressState(manifest, createConfig());

      progress.markStandaloneQuestion(2, 'q1', 100, false);

      expect(progress.gradedScore.attempted).toBe(false);
    });

    it('ignores a practice answer sharing a page with a graded question', () => {
      const manifest = createManifest(5, {}, { 2: { graded: true } });
      const progress = new ProgressState(manifest, createConfig());

      progress.markStandaloneQuestion(2, 'graded', 100, true);
      progress.markStandaloneQuestion(2, 'practice', 0, false);

      expect(progress.gradedScore.average).toBe(100);
    });

    it('averages quizzes and graded standalone pages together', () => {
      const manifest = createManifest(
        5,
        { 1: { graded: true } },
        { 3: { graded: true } },
      );
      const progress = new ProgressState(manifest, createConfig());

      progress.quizCompleted(1, 100);
      progress.markStandaloneQuestion(3, 'q1', 60, true);

      // (100 + 60) / 2 = 80
      expect(progress.gradedScore.average).toBe(80);
    });

    it('weights pages by pageConfig.weight', () => {
      const manifest = createManifest(
        5,
        { 1: { graded: true } },
        { 1: { weight: 30 }, 3: { graded: true, weight: 70 } },
      );
      const progress = new ProgressState(manifest, createConfig());

      progress.quizCompleted(1, 100);
      progress.markStandaloneQuestion(3, 'q1', 50, true);

      // (100*30 + 50*70) / 100 = 65
      expect(progress.gradedScore.average).toBe(65);
    });

    it('treats a non-positive weight as 1', () => {
      const manifest = createManifest(
        5,
        { 1: { graded: true }, 2: { graded: true } },
        { 1: { weight: 0 }, 2: { weight: Number.NaN } },
      );
      const progress = new ProgressState(manifest, createConfig());

      progress.quizCompleted(1, 100);
      progress.quizCompleted(2, 60);

      expect(progress.gradedScore.average).toBe(80);
    });

    it('weights a declared-graded page in even when it was never attempted', () => {
      const manifest = createManifest(
        5,
        {},
        {
          1: { graded: true, weight: 25 },
          3: { graded: true, weight: 75 },
        },
      );
      const progress = new ProgressState(manifest, createConfig());

      progress.markStandaloneQuestion(1, 'q1', 100, true);

      expect(progress.gradedScore.average).toBe(25);
      expect(progress.successStatus).toBe('unknown');
    });

    it('ignores an undeclared page even once a graded question is answered on it', () => {
      const manifest = createManifest(
        5,
        {},
        { 1: { graded: true, weight: 90 }, 3: { weight: 10 } },
      );
      const progress = new ProgressState(
        manifest,
        createConfig({ completion: { mode: 'quiz' } }),
      );

      progress.markStandaloneQuestion(1, 'q1', 100, true);
      progress.markStandaloneQuestion(3, 'q1', 0, true);

      expect(progress.pageScore(3)).toBe(0);
      expect(progress.gradedScore.average).toBe(100);
      expect(progress.successStatus).toBe('passed');
    });

    it('reports nothing when no page declares graded', () => {
      const progress = new ProgressState(createManifest(5), createConfig());

      progress.markStandaloneQuestion(2, 'q1', 0, true);

      expect(progress.gradedScore.attempted).toBe(false);
      expect(progress.successStatus).toBe('unknown');
    });

    const threeGradedQuizzes = createManifest(3, {
      0: { graded: true },
      1: { graded: true },
      2: { graded: true },
    });

    it('judges pass/fail on the 2-decimal average it reports', () => {
      const progress = new ProgressState(
        threeGradedQuizzes,
        createConfig({
          completion: { mode: 'quiz' },
          scoring: { passingScore: 66.66667 },
        }),
      );

      progress.quizCompleted(0, 100);
      progress.quizCompleted(1, 100);
      progress.quizCompleted(2, 0);

      expect(progress.gradedScore.average).toBe(66.67);
      expect(progress.successStatus).toBe('passed');
    });

    it('fails an average that would round up to the pass mark', () => {
      const progress = new ProgressState(threeGradedQuizzes, createConfig());

      progress.quizCompleted(0, 67);
      progress.quizCompleted(1, 67);
      progress.quizCompleted(2, 75);

      expect(progress.gradedScore.average).toBe(69.67);
      expect(progress.successStatus).toBe('failed');
    });
  });

  describe('optional graded pages (required: false)', () => {
    const examWithOptionalPractice = () =>
      new ProgressState(
        createManifest(
          5,
          {},
          {
            1: { graded: true, weight: 75 },
            3: { graded: true, required: false, weight: 100 },
          },
        ),
        createConfig({ completion: { mode: 'quiz' } }),
      );

    it('counts an optional page once scored, but never takes back a pass', () => {
      const progress = examWithOptionalPractice();

      progress.markStandaloneQuestion(1, 'q1', 100, true);

      expect(progress.gradedScore.average).toBe(100);
      expect(progress.successStatus).toBe('passed');

      progress.markStandaloneQuestion(3, 'q1', 0, true);

      expect(progress.gradedScore.average).toBe(42.86);
      expect(progress.reportedScore).toBe(100);
      expect(progress.successStatus).toBe('passed');
    });

    it('reports the best score from the pass on, and still a higher one', () => {
      const progress = examWithOptionalPractice();

      progress.markStandaloneQuestion(1, 'q1', 80, true);
      progress.markStandaloneQuestion(3, 'q1', 0, true);

      expect(progress.gradedScore.average).toBe(34.29);
      expect(progress.reportedScore).toBe(80);

      progress.markStandaloneQuestion(3, 'q1', 100, true);

      expect(progress.reportedScore).toBe(91.43);
    });

    it('keeps a fixed verdict once a re-grade undoes the completion', () => {
      const manifest = createManifest(
        4,
        { 0: { graded: true }, 1: { graded: true } },
        { 1: { required: false } },
      );
      const progress = new ProgressState(
        manifest,
        createConfig({
          completion: { mode: 'quiz' },
          success: { from: 'fixed', status: 'passed' },
        }),
      );

      progress.quizCompleted(0, 100);

      expect(progress.successStatus).toBe('passed');

      progress.quizCompleted(1, 0);

      expect(progress.completionStatus).toBe('incomplete');
      expect(progress.successStatus).toBe('passed');
    });

    it('cannot complete on the quiz average with no required page to judge', () => {
      const manifest = createManifest(
        5,
        { 1: { graded: true }, 3: { graded: true } },
        { 1: { required: false }, 3: { required: false } },
      );
      const progress = new ProgressState(
        manifest,
        createConfig({ completion: { mode: 'quiz' } }),
      );

      progress.quizCompleted(1, 100);

      expect(progress.gradedScore.average).toBe(100);
      expect(progress.completionStatus).toBe('incomplete');
      expect(progress.successStatus).toBe('unknown');
    });

    it('latches nothing on the partial totals a replay passes through', () => {
      const manifest = createManifest(
        3,
        { 0: { graded: true }, 1: { graded: true }, 2: { graded: true } },
        {
          0: { weight: 50 },
          1: { required: false, weight: 100 },
          2: { weight: 10 },
        },
      );
      const progress = new ProgressState(
        manifest,
        createConfig({ completion: { mode: 'quiz' } }),
      );

      progress.replay(() => {
        progress.restoreQuiz(0, 100, 1);
        progress.restoreQuiz(1, 0, 1);
      });

      expect(progress.reportedCompletionStatus).toBe('incomplete');
      expect(progress.gradedScoreFinal).toBe(false);
    });
  });

  describe('recalculateCompletion — quiz mode includes graded standalone', () => {
    it('graded standalone pages count toward completion in quiz mode', () => {
      const manifest = createManifest(5, {}, { 2: { graded: true } });
      const config = createConfig({
        completion: { mode: 'quiz' },
        scoring: { passingScore: 70 },
      });
      const progress = new ProgressState(manifest, config);

      progress.markStandaloneQuestion(2, 'q1', 80, true);

      expect(progress.completionStatus).toBe('complete');
    });
  });
});
