import { describe, it, expect } from 'vitest';
import { NavigationState } from '../src/runtime/navigation.svelte.js';
import { ProgressState } from '../src/runtime/progress.svelte.js';
import { createManifest, createConfig, gradedQuizIndices } from './helpers.js';

// ---------- NavigationState ----------

describe('NavigationState', () => {
  describe('goToPage', () => {
    it('updates currentPageIndex', () => {
      const nav = new NavigationState(
        createManifest(5),
        new ProgressState(new Set()),
        createConfig(),
      );
      nav.goToPage(3);
      expect(nav.currentPageIndex).toBe(3);
    });

    it('is a no-op for negative index', () => {
      const nav = new NavigationState(
        createManifest(5),
        new ProgressState(new Set()),
        createConfig(),
      );
      nav.goToPage(2);
      nav.goToPage(-1);
      expect(nav.currentPageIndex).toBe(2);
    });

    it('is a no-op for index beyond total pages', () => {
      const nav = new NavigationState(
        createManifest(5),
        new ProgressState(new Set()),
        createConfig(),
      );
      nav.goToPage(2);
      nav.goToPage(5);
      expect(nav.currentPageIndex).toBe(2);
    });

    it('is a no-op for index equal to total pages', () => {
      const nav = new NavigationState(
        createManifest(3),
        new ProgressState(new Set()),
        createConfig(),
      );
      nav.goToPage(3);
      expect(nav.currentPageIndex).toBe(0);
    });

    it('is a no-op for a locked page in free mode', () => {
      const manifest = createManifest(5, {
        2: { graded: true, gatesProgress: true },
      });
      const nav = new NavigationState(
        manifest,
        new ProgressState(gradedQuizIndices(manifest)),
        createConfig({
          navigation: { mode: 'free' },
          scoring: { passingScore: 70 },
        }),
      );
      nav.goToPage(4); // locked behind quiz gate at index 2
      expect(nav.currentPageIndex).toBe(0);
    });

    it('is a no-op for a locked page in sequential mode', () => {
      const nav = new NavigationState(
        createManifest(5),
        new ProgressState(new Set()),
        createConfig({ navigation: { mode: 'sequential' } }),
      );
      nav.goToPage(3); // locked — page 0 not visited
      expect(nav.currentPageIndex).toBe(0);
    });

    it('allows navigating to a locked page after it is unlocked', () => {
      const manifest = createManifest(5, {
        2: { graded: true, gatesProgress: true },
      });
      const progress = new ProgressState(gradedQuizIndices(manifest));
      const nav = new NavigationState(
        manifest,
        progress,
        createConfig({
          navigation: { mode: 'free' },
          scoring: { passingScore: 70 },
        }),
      );

      nav.goToPage(4);
      expect(nav.currentPageIndex).toBe(0); // still locked

      progress.quizCompleted(2, 80);
      nav.goToPage(4);
      expect(nav.currentPageIndex).toBe(4); // now unlocked
    });
  });

  describe('canGoPrev', () => {
    it('is false at index 0', () => {
      const nav = new NavigationState(
        createManifest(5),
        new ProgressState(new Set()),
        createConfig(),
      );
      expect(nav.canGoPrev).toBe(false);
    });

    it('is true when index > 0', () => {
      const nav = new NavigationState(
        createManifest(5),
        new ProgressState(new Set()),
        createConfig(),
      );
      nav.goToPage(1);
      expect(nav.canGoPrev).toBe(true);
    });
  });

  describe('canGoNext — free mode', () => {
    it('is true when not at last page', () => {
      const nav = new NavigationState(
        createManifest(5),
        new ProgressState(new Set()),
        createConfig({ navigation: { mode: 'free' } }),
      );
      expect(nav.canGoNext).toBe(true);
    });

    it('is false at last page', () => {
      const nav = new NavigationState(
        createManifest(3),
        new ProgressState(new Set()),
        createConfig({ navigation: { mode: 'free' } }),
      );
      nav.goToPage(2);
      expect(nav.canGoNext).toBe(false);
    });

    it('is false when next page is behind a quiz gate', () => {
      const manifest = createManifest(3, {
        1: { graded: true, gatesProgress: true },
      });
      const nav = new NavigationState(
        manifest,
        new ProgressState(gradedQuizIndices(manifest)),
        createConfig({
          navigation: { mode: 'free' },
          scoring: { passingScore: 70 },
        }),
      );

      nav.goToPage(0);
      expect(nav.canGoNext).toBe(true); // page 1 is the quiz itself, not gated

      nav.goToPage(1);
      expect(nav.canGoNext).toBe(false); // quiz not passed, page 2 gated
    });

    it('is true when next page quiz gate is passed', () => {
      const manifest = createManifest(3, {
        1: { graded: true, gatesProgress: true },
      });
      const progress = new ProgressState(gradedQuizIndices(manifest));
      const nav = new NavigationState(
        manifest,
        progress,
        createConfig({
          navigation: { mode: 'free' },
          scoring: { passingScore: 70 },
        }),
      );

      progress.quizCompleted(1, 80);
      nav.goToPage(1);
      expect(nav.canGoNext).toBe(true);
    });
  });

  describe('canGoNext — sequential mode', () => {
    it('is false when current page not visited (informational)', () => {
      const nav = new NavigationState(
        createManifest(3),
        new ProgressState(new Set()),
        createConfig({ navigation: { mode: 'sequential' } }),
      );
      expect(nav.canGoNext).toBe(false);
    });

    it('is true when current page is visited', () => {
      const progress = new ProgressState(new Set());
      const nav = new NavigationState(
        createManifest(3),
        progress,
        createConfig({ navigation: { mode: 'sequential' } }),
      );
      progress.markVisited(0);
      expect(nav.canGoNext).toBe(true);
    });

    it('is false when current page is a gating quiz not passed', () => {
      const manifest = createManifest(3, {
        0: { graded: true, gatesProgress: true },
      });
      const progress = new ProgressState(gradedQuizIndices(manifest));
      const nav = new NavigationState(
        manifest,
        progress,
        createConfig({
          navigation: { mode: 'sequential' },
          scoring: { passingScore: 70 },
        }),
      );
      progress.quizCompleted(0, 50);
      expect(nav.canGoNext).toBe(false);
    });

    it('is true when current page is a gating quiz and passed', () => {
      const manifest = createManifest(3, {
        0: { graded: true, gatesProgress: true },
      });
      const progress = new ProgressState(gradedQuizIndices(manifest));
      const nav = new NavigationState(
        manifest,
        progress,
        createConfig({
          navigation: { mode: 'sequential' },
          scoring: { passingScore: 70 },
        }),
      );
      progress.quizCompleted(0, 75);
      expect(nav.canGoNext).toBe(true);
    });
  });

  describe('goNext / goPrev', () => {
    it('goNext increments page index', () => {
      const nav = new NavigationState(
        createManifest(5),
        new ProgressState(new Set()),
        createConfig(),
      );
      nav.goNext();
      expect(nav.currentPageIndex).toBe(1);
    });

    it('goPrev decrements page index', () => {
      const nav = new NavigationState(
        createManifest(5),
        new ProgressState(new Set()),
        createConfig(),
      );
      nav.goToPage(3);
      nav.goPrev();
      expect(nav.currentPageIndex).toBe(2);
    });

    it('goNext is no-op at last page', () => {
      const nav = new NavigationState(
        createManifest(3),
        new ProgressState(new Set()),
        createConfig(),
      );
      nav.goToPage(2);
      nav.goNext();
      expect(nav.currentPageIndex).toBe(2);
    });

    it('goPrev is no-op at first page', () => {
      const nav = new NavigationState(
        createManifest(3),
        new ProgressState(new Set()),
        createConfig(),
      );
      nav.goPrev();
      expect(nav.currentPageIndex).toBe(0);
    });
  });

  describe('isPageLocked', () => {
    it('delegates to the resolved access function (rules covered in access.test.ts)', () => {
      const manifest = createManifest(3);
      const progress = new ProgressState(gradedQuizIndices(manifest));
      const config = createConfig({
        navigation: {
          mode: 'free',
          canAccess: ({ pageIndex, progress }) =>
            pageIndex === 0 || progress.visitedPages.has(0),
        },
      });
      const nav = new NavigationState(manifest, progress, config);

      expect(nav.isPageLocked(1)).toBe(true);
      progress.markVisited(0);
      expect(nav.isPageLocked(1)).toBe(false);
    });
  });

  describe('empty manifest', () => {
    it('canGoNext and canGoPrev are both false', () => {
      const nav = new NavigationState(
        createManifest(0),
        new ProgressState(new Set()),
        createConfig(),
      );
      expect(nav.canGoNext).toBe(false);
      expect(nav.canGoPrev).toBe(false);
    });

    it('goToPage(0) is a no-op', () => {
      const nav = new NavigationState(
        createManifest(0),
        new ProgressState(new Set()),
        createConfig(),
      );
      nav.goToPage(0);
      expect(nav.currentPageIndex).toBe(0);
    });
  });
});
