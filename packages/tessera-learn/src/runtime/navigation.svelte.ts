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

export type PageModuleMap = Record<string, () => Promise<unknown>>;

export class NavigationState {
  manifest = $state<Manifest>(null!);
  #progress: ProgressState;
  #config: CourseConfig;
  #pageModules: PageModuleMap | null = null;
  currentPageIndex = $state(0);

  canGoPrev = $derived(this.currentPageIndex > 0);

  canGoNext = $derived.by(() => {
    const next = this.currentPageIndex + 1;
    if (next >= this.manifest.totalPages) return false;
    return !this.isPageLocked(next);
  });

  // Cache locked-page lookup as a single derived Set so the sidebar's
  // per-page `isPageLocked` calls stay O(1). Without this, sequential mode
  // is O(n²) per render (each `isPageLocked` walks all earlier pages).
  // Recomputed once per relevant state change.
  #prevLockedSet: Set<number> | null = null;
  #lockedSet = $derived.by<Set<number>>(() => {
    const next = this.#computeLockedSet();
    const prev = this.#prevLockedSet;
    if (prev && prev.size === next.size) {
      let same = true;
      for (const i of next) {
        if (!prev.has(i)) { same = false; break; }
      }
      if (same) return prev;
    }
    this.#prevLockedSet = next;
    return next;
  });

  constructor(manifest: Manifest, progress: ProgressState, config: CourseConfig) {
    this.manifest = manifest;
    this.#progress = progress;
    this.#config = config;
  }

  setPageModules(modules: PageModuleMap) {
    this.#pageModules = modules;
  }

  /**
   * Warm the browser module cache for a page chunk. Idempotent — repeated
   * calls for the same index hit the existing cache. Bails on locked pages
   * so callers don't need to guard.
   */
  prefetch(index: number) {
    if (!this.#pageModules) return;
    if (index < 0 || index >= this.manifest.totalPages) return;
    if (this.isPageLocked(index)) return;
    const page = this.manifest.pages[index];
    this.#pageModules[page.importPath]?.();
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
    return this.#lockedSet.has(index);
  }

  // Compute the locked set in a single forward pass. The built-in modes are
  // expressed inline (rather than calling resolveAccess/freeAccess/sequential
  // per page) so the whole walk is O(n). Custom predicates fall back to a
  // per-page evaluation since their semantics are arbitrary — but it still
  // runs once per state change rather than once per page per render.
  #computeLockedSet(): Set<number> {
    const total = this.manifest.totalPages;
    const locked = new Set<number>();

    if (this.#config.navigation.canAccess) {
      const fn = this.#config.navigation.canAccess;
      for (let i = 0; i < total; i++) {
        if (!fn({
          pageIndex: i,
          page: this.manifest.pages[i],
          manifest: this.manifest,
          progress: this.#progress,
          config: this.#config,
        })) {
          locked.add(i);
        }
      }
      return locked;
    }

    if (this.#config.navigation.mode === 'sequential') {
      // Once any page is incomplete, every later page is locked.
      for (let i = 1; i < total; i++) {
        if (!isPageComplete(i - 1, this.manifest, this.#progress, this.#config)) {
          for (let k = i; k < total; k++) locked.add(k);
          return locked;
        }
      }
      return locked;
    }

    // Free mode: a page is locked iff its most-recent gating quiz is unmet.
    let lastGatingUnmet = false;
    for (let i = 0; i < total; i++) {
      if (lastGatingUnmet) locked.add(i);
      const page = this.manifest.pages[i];
      if (page.quiz?.gatesProgress) {
        const score = this.#progress.quizScores.get(i) ?? 0;
        lastGatingUnmet = score < this.#config.scoring.passingScore;
      }
    }
    return locked;
  }
}
