import { describe, it, expect } from 'vitest';
import { NavigationState } from '../src/runtime/navigation.svelte.js';
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

// ---------- NavigationState ----------

describe('NavigationState', () => {
  describe('goToPage', () => {
    it('updates currentPageIndex', () => {
      const manifest = createManifest(5);
      const progress = new ProgressState();
      const config = createConfig();
      const nav = new NavigationState(manifest, progress, config);

      nav.goToPage(3);
      expect(nav.currentPageIndex).toBe(3);
    });

    it('is a no-op for negative index', () => {
      const manifest = createManifest(5);
      const progress = new ProgressState();
      const config = createConfig();
      const nav = new NavigationState(manifest, progress, config);

      nav.goToPage(2);
      nav.goToPage(-1);
      expect(nav.currentPageIndex).toBe(2);
    });

    it('is a no-op for index beyond total pages', () => {
      const manifest = createManifest(5);
      const progress = new ProgressState();
      const config = createConfig();
      const nav = new NavigationState(manifest, progress, config);

      nav.goToPage(2);
      nav.goToPage(5);
      expect(nav.currentPageIndex).toBe(2);
    });

    it('is a no-op for index equal to total pages', () => {
      const manifest = createManifest(3);
      const progress = new ProgressState();
      const config = createConfig();
      const nav = new NavigationState(manifest, progress, config);

      nav.goToPage(3);
      expect(nav.currentPageIndex).toBe(0);
    });
  });

  describe('canGoPrev', () => {
    it('is false at index 0', () => {
      const manifest = createManifest(5);
      const progress = new ProgressState();
      const config = createConfig();
      const nav = new NavigationState(manifest, progress, config);

      expect(nav.canGoPrev).toBe(false);
    });

    it('is true when index > 0', () => {
      const manifest = createManifest(5);
      const progress = new ProgressState();
      const config = createConfig();
      const nav = new NavigationState(manifest, progress, config);

      nav.goToPage(1);
      expect(nav.canGoPrev).toBe(true);
    });
  });

  describe('canGoNext — free mode', () => {
    it('is true when not at last page', () => {
      const manifest = createManifest(5);
      const progress = new ProgressState();
      const config = createConfig({ navigation: { mode: 'free' } });
      const nav = new NavigationState(manifest, progress, config);

      expect(nav.canGoNext).toBe(true);
    });

    it('is false at last page', () => {
      const manifest = createManifest(3);
      const progress = new ProgressState();
      const config = createConfig({ navigation: { mode: 'free' } });
      const nav = new NavigationState(manifest, progress, config);

      nav.goToPage(2);
      expect(nav.canGoNext).toBe(false);
    });

    it('is false when next page is behind a quiz gate', () => {
      // Page 1 is a gating quiz, page 2 is locked until page 1 is passed
      const manifest = createManifest(3, { 1: { graded: true, gatesProgress: true } });
      const progress = new ProgressState();
      const config = createConfig({ navigation: { mode: 'free' }, scoring: { passingScore: 70 } });
      const nav = new NavigationState(manifest, progress, config);

      nav.goToPage(0);
      expect(nav.canGoNext).toBe(true); // page 1 is the quiz itself, not gated

      nav.goToPage(1);
      // Quiz not passed, next page (2) is gated
      expect(nav.canGoNext).toBe(false);
    });

    it('is true when next page quiz gate is passed', () => {
      const manifest = createManifest(3, { 1: { graded: true, gatesProgress: true } });
      const progress = new ProgressState();
      const config = createConfig({ navigation: { mode: 'free' }, scoring: { passingScore: 70 } });
      const nav = new NavigationState(manifest, progress, config);

      progress.quizCompleted(1, 80);
      nav.goToPage(1);
      expect(nav.canGoNext).toBe(true);
    });
  });

  describe('canGoNext — sequential mode', () => {
    it('is false when current page not visited (informational)', () => {
      const manifest = createManifest(3);
      const progress = new ProgressState();
      const config = createConfig({ navigation: { mode: 'sequential' } });
      const nav = new NavigationState(manifest, progress, config);

      // Page 0 not visited yet
      expect(nav.canGoNext).toBe(false);
    });

    it('is true when current page is visited', () => {
      const manifest = createManifest(3);
      const progress = new ProgressState();
      const config = createConfig({ navigation: { mode: 'sequential' } });
      const nav = new NavigationState(manifest, progress, config);

      progress.markVisited(0);
      expect(nav.canGoNext).toBe(true);
    });

    it('is false when current page is a gating quiz not passed', () => {
      const manifest = createManifest(3, { 0: { graded: true, gatesProgress: true } });
      const progress = new ProgressState();
      const config = createConfig({ navigation: { mode: 'sequential' }, scoring: { passingScore: 70 } });
      const nav = new NavigationState(manifest, progress, config);

      progress.quizCompleted(0, 50); // below passing
      expect(nav.canGoNext).toBe(false);
    });

    it('is true when current page is a gating quiz and passed', () => {
      const manifest = createManifest(3, { 0: { graded: true, gatesProgress: true } });
      const progress = new ProgressState();
      const config = createConfig({ navigation: { mode: 'sequential' }, scoring: { passingScore: 70 } });
      const nav = new NavigationState(manifest, progress, config);

      progress.quizCompleted(0, 75);
      expect(nav.canGoNext).toBe(true);
    });
  });

  describe('goNext / goPrev', () => {
    it('goNext increments page index', () => {
      const manifest = createManifest(5);
      const progress = new ProgressState();
      const config = createConfig();
      const nav = new NavigationState(manifest, progress, config);

      nav.goNext();
      expect(nav.currentPageIndex).toBe(1);
    });

    it('goPrev decrements page index', () => {
      const manifest = createManifest(5);
      const progress = new ProgressState();
      const config = createConfig();
      const nav = new NavigationState(manifest, progress, config);

      nav.goToPage(3);
      nav.goPrev();
      expect(nav.currentPageIndex).toBe(2);
    });

    it('goNext is no-op at last page', () => {
      const manifest = createManifest(3);
      const progress = new ProgressState();
      const config = createConfig();
      const nav = new NavigationState(manifest, progress, config);

      nav.goToPage(2);
      nav.goNext();
      expect(nav.currentPageIndex).toBe(2);
    });

    it('goPrev is no-op at first page', () => {
      const manifest = createManifest(3);
      const progress = new ProgressState();
      const config = createConfig();
      const nav = new NavigationState(manifest, progress, config);

      nav.goPrev();
      expect(nav.currentPageIndex).toBe(0);
    });
  });

  describe('isPageLocked — free mode', () => {
    it('returns false for all pages with no quiz gates', () => {
      const manifest = createManifest(5);
      const progress = new ProgressState();
      const config = createConfig({ navigation: { mode: 'free' } });
      const nav = new NavigationState(manifest, progress, config);

      for (let i = 0; i < 5; i++) {
        expect(nav.isPageLocked(i)).toBe(false);
      }
    });

    it('locks pages after an unpassed gating quiz', () => {
      const manifest = createManifest(5, { 2: { graded: true, gatesProgress: true } });
      const progress = new ProgressState();
      const config = createConfig({ navigation: { mode: 'free' }, scoring: { passingScore: 70 } });
      const nav = new NavigationState(manifest, progress, config);

      // Pages 0, 1, 2 are accessible
      expect(nav.isPageLocked(0)).toBe(false);
      expect(nav.isPageLocked(1)).toBe(false);
      expect(nav.isPageLocked(2)).toBe(false);
      // Pages 3, 4 are locked
      expect(nav.isPageLocked(3)).toBe(true);
      expect(nav.isPageLocked(4)).toBe(true);
    });

    it('unlocks pages after gating quiz is passed', () => {
      const manifest = createManifest(5, { 2: { graded: true, gatesProgress: true } });
      const progress = new ProgressState();
      const config = createConfig({ navigation: { mode: 'free' }, scoring: { passingScore: 70 } });
      const nav = new NavigationState(manifest, progress, config);

      progress.quizCompleted(2, 80);
      expect(nav.isPageLocked(3)).toBe(false);
      expect(nav.isPageLocked(4)).toBe(false);
    });

    it('respects nearest preceding gating quiz', () => {
      // Two gating quizzes: at index 1 and index 3
      const manifest = createManifest(6, {
        1: { graded: true, gatesProgress: true },
        3: { graded: true, gatesProgress: true },
      });
      const progress = new ProgressState();
      const config = createConfig({ navigation: { mode: 'free' }, scoring: { passingScore: 70 } });
      const nav = new NavigationState(manifest, progress, config);

      // Pass first gate
      progress.quizCompleted(1, 80);
      expect(nav.isPageLocked(2)).toBe(false);
      expect(nav.isPageLocked(3)).toBe(false);
      // Second gate not passed
      expect(nav.isPageLocked(4)).toBe(true);
      expect(nav.isPageLocked(5)).toBe(true);
    });
  });

  describe('isPageLocked — sequential mode', () => {
    it('locks pages when preceding pages not visited', () => {
      const manifest = createManifest(5);
      const progress = new ProgressState();
      const config = createConfig({ navigation: { mode: 'sequential' } });
      const nav = new NavigationState(manifest, progress, config);

      expect(nav.isPageLocked(0)).toBe(false);
      expect(nav.isPageLocked(1)).toBe(true);
      expect(nav.isPageLocked(2)).toBe(true);
    });

    it('unlocks pages as they are visited in order', () => {
      const manifest = createManifest(4);
      const progress = new ProgressState();
      const config = createConfig({ navigation: { mode: 'sequential' } });
      const nav = new NavigationState(manifest, progress, config);

      progress.markVisited(0);
      expect(nav.isPageLocked(1)).toBe(false);
      expect(nav.isPageLocked(2)).toBe(true);

      progress.markVisited(1);
      expect(nav.isPageLocked(2)).toBe(false);
    });

    it('locks pages behind unpassed gating quiz even if visited', () => {
      const manifest = createManifest(4, { 1: { graded: true, gatesProgress: true } });
      const progress = new ProgressState();
      const config = createConfig({ navigation: { mode: 'sequential' }, scoring: { passingScore: 70 } });
      const nav = new NavigationState(manifest, progress, config);

      progress.markVisited(0);
      // Quiz page 1 is accessible (not locked) but completing it with failing score...
      expect(nav.isPageLocked(1)).toBe(false);
      progress.quizCompleted(1, 50); // failing score
      // Page 2 still locked because quiz gate not passed
      expect(nav.isPageLocked(2)).toBe(true);
    });
  });
});
