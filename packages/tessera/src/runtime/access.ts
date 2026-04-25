import type { Manifest, ManifestPage } from '../plugin/manifest.js';
import type { CourseConfig } from './types.js';
import type { ProgressState } from './progress.svelte.js';
import { isPageComplete } from './navigation.svelte.js';

export interface AccessContext {
  pageIndex: number;
  page: ManifestPage;
  manifest: Manifest;
  progress: ProgressState;
  config: CourseConfig;
}

/**
 * Predicate deciding whether a page is accessible to the learner.
 *
 * Runs synchronously on every derived re-evaluation — keep it cheap. It is a
 * runtime-side check only: the LMS does not enforce these rules. Authors who
 * need true sequencing must rely on the LMS standard's own activity rules.
 */
export type AccessFn = (ctx: AccessContext) => boolean;

/**
 * Free-navigation preset. A page is accessible unless a preceding page declares
 * `pageConfig.quiz.gatesProgress` and the learner has not met the passing score.
 */
export const freeAccess: AccessFn = ({ pageIndex, manifest, progress, config }) => {
  for (let i = pageIndex - 1; i >= 0; i--) {
    const page = manifest.pages[i];
    if (page.quiz?.gatesProgress) {
      return (progress.quizScores.get(i) ?? 0) >= config.scoring.passingScore;
    }
  }
  return true;
};

/**
 * Sequential-navigation preset. A page is accessible only when every preceding
 * page is complete (visited or quiz-passed, per `isPageComplete`).
 */
export const sequentialAccess: AccessFn = ({ pageIndex, manifest, progress, config }) => {
  for (let i = 0; i < pageIndex; i++) {
    if (!isPageComplete(i, manifest, progress, config)) return false;
  }
  return true;
};

/**
 * Resolve the access predicate for a course. Custom `config.navigation.canAccess`
 * wins; otherwise the preset matching `config.navigation.mode` is returned.
 */
export function resolveAccess(config: CourseConfig): AccessFn {
  if (config.navigation.canAccess) return config.navigation.canAccess;
  return config.navigation.mode === 'sequential' ? sequentialAccess : freeAccess;
}
