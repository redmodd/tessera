import type { Manifest } from '../plugin/manifest.js';
import type { CourseConfig } from './types.js';
import { ProgressState } from './progress.svelte.js';

export function isPageComplete(
  index: number,
  manifest: Manifest,
  progress: ProgressState,
  config: CourseConfig
): boolean {
  const page = manifest.pages[index];
  if (!page) return false;

  if (!page.quiz) {
    return progress.visitedPages.has(index);
  }

  if (!page.quiz.gatesProgress) {
    return progress.quizScores.has(index);
  }

  return (progress.quizScores.get(index) ?? 0) >= config.scoring.passingScore;
}

export class NavigationState {
  manifest = $state<Manifest>(null!);
  #progress: ProgressState;
  #config: CourseConfig;
  currentPageIndex = $state(0);

  canGoPrev = $derived(this.currentPageIndex > 0);

  canGoNext = $derived.by(() => {
    const next = this.currentPageIndex + 1;
    if (next >= this.manifest.totalPages) return false;

    if (this.#config.navigation.mode === 'sequential') {
      return isPageComplete(this.currentPageIndex, this.manifest, this.#progress, this.#config);
    }

    // Free mode: check if next page is locked by a quiz gate
    return !this.isPageLocked(next);
  });

  constructor(manifest: Manifest, progress: ProgressState, config: CourseConfig) {
    this.manifest = manifest;
    this.#progress = progress;
    this.#config = config;
  }

  goToPage(index: number) {
    if (index < 0 || index >= this.manifest.totalPages) return;
    this.currentPageIndex = index;
  }

  goNext() {
    if (this.canGoNext) this.goToPage(this.currentPageIndex + 1);
  }

  goPrev() {
    if (this.canGoPrev) this.goToPage(this.currentPageIndex - 1);
  }

  isPageLocked(index: number): boolean {
    if (this.#config.navigation.mode === 'sequential') {
      return this.#isPageLockedSequential(index);
    }
    return this.#isPageLockedFree(index);
  }

  #isPageLockedFree(index: number): boolean {
    // Scan backwards from the target page for the nearest gating quiz
    for (let i = index - 1; i >= 0; i--) {
      const page = this.manifest.pages[i];
      if (page.quiz?.gatesProgress) {
        return (this.#progress.quizScores.get(i) ?? 0) < this.#config.scoring.passingScore;
      }
    }
    return false;
  }

  #isPageLockedSequential(index: number): boolean {
    // All preceding pages must be complete
    for (let i = 0; i < index; i++) {
      if (!isPageComplete(i, this.manifest, this.#progress, this.#config)) {
        return true;
      }
    }
    return false;
  }
}
