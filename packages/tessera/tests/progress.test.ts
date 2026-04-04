import { describe, it, expect } from 'vitest';
import { ProgressState } from '../src/runtime/progress.svelte.js';
import type { Manifest } from '../src/plugin/manifest.js';
import type { CourseConfig } from '../src/runtime/types.js';

function createManifest(pageCount: number, quizPages: Record<number, { graded?: boolean; gatesProgress?: boolean }> = {}): Manifest {
  const pages = Array.from({ length: pageCount }, (_, i) => ({
    index: i,
    title: `Page ${i}`,
    slug: `page-${i}`,
    importPath: `/pages/page-${i}.svelte`,
    quiz: quizPages[i] ? {
      graded: quizPages[i].graded ?? false,
      gatesProgress: quizPages[i].gatesProgress ?? false,
      maxAttempts: 3,
      showFeedback: true,
    } : null,
  }));

  return {
    sections: [{
      title: 'Section',
      slug: 'section',
      lessons: [{
        title: 'Lesson',
        slug: 'lesson',
        pages,
      }],
    }],
    pages,
    totalPages: pageCount,
  };
}

function createConfig(overrides: Partial<CourseConfig> = {}): CourseConfig {
  return {
    title: 'Test',
    description: '',
    author: '',
    version: '1.0.0',
    branding: { logo: '', primaryColor: '#2563eb', fontFamily: 'Inter' },
    navigation: { mode: 'free' as const },
    completion: { mode: 'percentage' as const, percentageThreshold: 100 },
    scoring: { passingScore: 70 },
    export: { standard: 'web' as const },
    ...overrides,
  };
}

// ---------- ProgressState ----------

describe('ProgressState', () => {
  describe('markVisited', () => {
    it('adds page index to visited set', () => {
      const progress = new ProgressState();
      progress.markVisited(0);
      expect(progress.visitedPages.has(0)).toBe(true);
    });

    it('is idempotent', () => {
      const progress = new ProgressState();
      progress.markVisited(0);
      progress.markVisited(0);
      expect(progress.visitedPages.size).toBe(1);
    });

    it('tracks multiple pages', () => {
      const progress = new ProgressState();
      progress.markVisited(0);
      progress.markVisited(3);
      progress.markVisited(5);
      expect(progress.visitedPages.size).toBe(3);
      expect(progress.visitedPages.has(3)).toBe(true);
    });
  });

  describe('quizCompleted', () => {
    it('stores quiz score', () => {
      const progress = new ProgressState();
      progress.quizCompleted(2, 85);
      expect(progress.quizScores.get(2)).toBe(85);
    });

    it('replaces previous score on retry', () => {
      const progress = new ProgressState();
      progress.quizCompleted(2, 50);
      progress.quizCompleted(2, 90);
      expect(progress.quizScores.get(2)).toBe(90);
    });
  });

  describe('recalculateCompletion — percentage mode', () => {
    it('incomplete when below threshold', () => {
      const manifest = createManifest(10);
      const config = createConfig({ completion: { mode: 'percentage', percentageThreshold: 80 } });
      const progress = new ProgressState();

      // Visit 7 of 10 = 70%, threshold is 80%
      for (let i = 0; i < 7; i++) progress.markVisited(i);

      progress.recalculateCompletion(manifest, config);
      expect(progress.completionStatus).toBe('incomplete');
    });

    it('complete when at threshold', () => {
      const manifest = createManifest(10);
      const config = createConfig({ completion: { mode: 'percentage', percentageThreshold: 80 } });
      const progress = new ProgressState();

      for (let i = 0; i < 8; i++) progress.markVisited(i);

      progress.recalculateCompletion(manifest, config);
      expect(progress.completionStatus).toBe('complete');
    });

    it('complete when above threshold', () => {
      const manifest = createManifest(10);
      const config = createConfig({ completion: { mode: 'percentage', percentageThreshold: 80 } });
      const progress = new ProgressState();

      for (let i = 0; i < 10; i++) progress.markVisited(i);

      progress.recalculateCompletion(manifest, config);
      expect(progress.completionStatus).toBe('complete');
    });

    it('complete with 100% threshold when all pages visited', () => {
      const manifest = createManifest(5);
      const config = createConfig({ completion: { mode: 'percentage', percentageThreshold: 100 } });
      const progress = new ProgressState();

      for (let i = 0; i < 5; i++) progress.markVisited(i);

      progress.recalculateCompletion(manifest, config);
      expect(progress.completionStatus).toBe('complete');
    });
  });

  describe('recalculateCompletion — quiz mode', () => {
    it('incomplete when no quizzes attempted', () => {
      const manifest = createManifest(5, { 2: { graded: true }, 4: { graded: true } });
      const config = createConfig({ completion: { mode: 'quiz' }, scoring: { passingScore: 70 } });
      const progress = new ProgressState();

      progress.recalculateCompletion(manifest, config);
      expect(progress.completionStatus).toBe('incomplete');
    });

    it('incomplete when average below passing score (unattempted count as 0)', () => {
      const manifest = createManifest(5, { 2: { graded: true }, 4: { graded: true } });
      const config = createConfig({ completion: { mode: 'quiz' }, scoring: { passingScore: 70 } });
      const progress = new ProgressState();

      // Only quiz 2 passed with 90, quiz 4 unattempted
      // Average = (90 + 0) / 2 = 45, below 70
      progress.quizCompleted(2, 90);

      progress.recalculateCompletion(manifest, config);
      expect(progress.completionStatus).toBe('incomplete');
    });

    it('complete when average meets passing score', () => {
      const manifest = createManifest(5, { 2: { graded: true }, 4: { graded: true } });
      const config = createConfig({ completion: { mode: 'quiz' }, scoring: { passingScore: 70 } });
      const progress = new ProgressState();

      progress.quizCompleted(2, 90);
      progress.quizCompleted(4, 80);
      // Average = (90 + 80) / 2 = 85 >= 70

      progress.recalculateCompletion(manifest, config);
      expect(progress.completionStatus).toBe('complete');
    });

    it('incomplete when no graded quizzes exist', () => {
      const manifest = createManifest(5);
      const config = createConfig({ completion: { mode: 'quiz' }, scoring: { passingScore: 70 } });
      const progress = new ProgressState();

      progress.recalculateCompletion(manifest, config);
      expect(progress.completionStatus).toBe('incomplete');
    });
  });

  describe('recalculateSuccess', () => {
    it('is unknown when no graded quizzes exist', () => {
      const manifest = createManifest(5);
      const config = createConfig({ scoring: { passingScore: 70 } });
      const progress = new ProgressState();

      progress.recalculateSuccess(manifest, config);
      expect(progress.successStatus).toBe('unknown');
    });

    it('is failed when no graded quizzes attempted', () => {
      const manifest = createManifest(5, { 2: { graded: true } });
      const config = createConfig({ scoring: { passingScore: 70 } });
      const progress = new ProgressState();

      progress.recalculateSuccess(manifest, config);
      expect(progress.successStatus).toBe('failed');
    });

    it('computes passed when average meets passing score', () => {
      const manifest = createManifest(5, { 2: { graded: true }, 4: { graded: true } });
      const config = createConfig({ scoring: { passingScore: 70 } });
      const progress = new ProgressState();

      progress.quizCompleted(2, 80);
      progress.quizCompleted(4, 75);
      // Average = (80 + 75) / 2 = 77.5 >= 70

      progress.recalculateSuccess(manifest, config);
      expect(progress.successStatus).toBe('passed');
    });

    it('computes failed when average below passing score', () => {
      const manifest = createManifest(5, { 2: { graded: true }, 4: { graded: true } });
      const config = createConfig({ scoring: { passingScore: 70 } });
      const progress = new ProgressState();

      progress.quizCompleted(2, 80);
      // Quiz 4 unattempted = 0
      // Average = (80 + 0) / 2 = 40 < 70

      progress.recalculateSuccess(manifest, config);
      expect(progress.successStatus).toBe('failed');
    });

    it('runs independently of completion mode', () => {
      // Even with percentage completion mode, success should be based on quiz scores
      const manifest = createManifest(5, { 2: { graded: true } });
      const config = createConfig({
        completion: { mode: 'percentage', percentageThreshold: 100 },
        scoring: { passingScore: 70 },
      });
      const progress = new ProgressState();

      progress.quizCompleted(2, 90);
      progress.recalculateSuccess(manifest, config);
      expect(progress.successStatus).toBe('passed');
    });

    it('ignores non-graded quizzes', () => {
      const manifest = createManifest(5, {
        1: { graded: false },  // practice quiz
        3: { graded: true },   // graded quiz
      });
      const config = createConfig({ scoring: { passingScore: 70 } });
      const progress = new ProgressState();

      progress.quizCompleted(1, 100); // practice — should be ignored
      progress.quizCompleted(3, 80);
      // Only graded quiz 3 counts: 80 / 1 = 80 >= 70

      progress.recalculateSuccess(manifest, config);
      expect(progress.successStatus).toBe('passed');
    });

    it('unattempted graded quizzes count as 0 in denominator', () => {
      const manifest = createManifest(10, {
        2: { graded: true },
        5: { graded: true },
        8: { graded: true },
      });
      const config = createConfig({ scoring: { passingScore: 70 } });
      const progress = new ProgressState();

      progress.quizCompleted(2, 95);
      progress.quizCompleted(8, 80);
      // Quiz 5 unattempted
      // Average = (95 + 0 + 80) / 3 = 58.3 < 70

      progress.recalculateSuccess(manifest, config);
      expect(progress.successStatus).toBe('failed');
    });
  });
});
