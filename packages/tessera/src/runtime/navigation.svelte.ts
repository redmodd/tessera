import type { Manifest } from '../plugin/manifest.js';
import type { CourseConfig } from './types.js';
import { ProgressState } from './progress.svelte.js';
import { resolveAccess } from './access.js';

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
    return !this.isPageLocked(next);
  });

  constructor(manifest: Manifest, progress: ProgressState, config: CourseConfig) {
    this.manifest = manifest;
    this.#progress = progress;
    this.#config = config;
  }

  goToPage(index: number) {
    if (index < 0 || index >= this.manifest.totalPages) return;
    if (this.isPageLocked(index)) return;
    this.currentPageIndex = index;
  }

  goNext() {
    if (this.canGoNext) this.goToPage(this.currentPageIndex + 1);
  }

  goPrev() {
    if (this.canGoPrev) this.goToPage(this.currentPageIndex - 1);
  }

  isPageLocked(index: number): boolean {
    const fn = resolveAccess(this.#config);
    return !fn({
      pageIndex: index,
      page: this.manifest.pages[index],
      manifest: this.manifest,
      progress: this.#progress,
      config: this.#config,
    });
  }
}
