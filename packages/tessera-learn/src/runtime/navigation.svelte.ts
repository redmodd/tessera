import type { Manifest } from '../plugin/manifest.js';
import type { CourseConfig } from './types.js';
import { ProgressState } from './progress.svelte.js';
import { resolveAccess } from './access.js';

export function isPageComplete(
  index: number,
  manifest: Manifest,
  progress: ProgressState,
  config: CourseConfig,
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

  // Memo cache so the derived can return a stable Set reference when
  // membership is unchanged (two Sets with identical contents are not `===`).
  // Must NOT be `$state` — that would make this a reactive-state mutation
  // from inside a derived.
  #prevLockedSet: Set<number> | null = null;
  #lockedSet = $derived.by<Set<number>>(() => {
    const next = this.#computeLockedSet();
    const prev = this.#prevLockedSet;
    if (prev && prev.size === next.size) {
      let same = true;
      for (const i of next) {
        if (!prev.has(i)) {
          same = false;
          break;
        }
      }
      if (same) return prev;
    }
    this.#prevLockedSet = next;
    return next;
  });

  constructor(
    manifest: Manifest,
    progress: ProgressState,
    config: CourseConfig,
  ) {
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
    void this.#pageModules[page.importPath]?.();
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

  // Resolve the access predicate once (custom canAccess, or the free /
  // sequential preset) and evaluate it per page. Runs once per state change
  // — the presets are the single source of truth for the gating rules.
  #computeLockedSet(): Set<number> {
    const total = this.manifest.totalPages;
    const locked = new Set<number>();
    const access = resolveAccess(this.#config);
    for (let i = 0; i < total; i++) {
      if (
        !access({
          pageIndex: i,
          page: this.manifest.pages[i],
          manifest: this.manifest,
          progress: this.#progress,
          config: this.#config,
        })
      ) {
        locked.add(i);
      }
    }
    return locked;
  }
}
