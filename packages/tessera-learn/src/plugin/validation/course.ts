import {
  largerSuspendDataStandards,
  type StandardProfile,
} from '../../runtime/standards.js';
import { resolveSuccess } from '../../runtime/types.js';
import type { ParsedConfig } from './config.js';
import { quoteList, type Diagnostics } from './diagnostics.js';
import type { PageInfo, PagesValidationResult } from './page.js';

function reportEffectiveWeights(
  pageResults: PagesValidationResult,
  d: Diagnostics,
): void {
  const graded = pageResults.pages.filter((p) => p.graded);
  if (!graded.some((p) => p.weight !== undefined)) return;
  const weightOf = (p: PageInfo) => p.weight ?? 1;
  const required = graded.filter((p) => p.requiredGraded);
  const optional = graded.filter((p) => !p.requiredGraded);
  const total = required.reduce((sum, p) => sum + weightOf(p), 0);
  if (required.length > 0) {
    const shares = required
      .map((p) => `${p.fileRel} ${((weightOf(p) / total) * 100).toFixed(1)}%`)
      .join(', ');
    d.info(`course score weighting: ${shares}`);
  }
  if (optional.length > 0) {
    const list = optional
      .map((p) => `${p.fileRel} weight ${weightOf(p)}`)
      .join(', ');
    d.info(
      required.length > 0
        ? `course score weighting: these pages are optional, so each joins the rollup ` +
            `only when the learner takes it: ${list}`
        : `course score weighting: no graded page is required, so the course score covers ` +
            `only the pages the learner takes: ${list}`,
    );
  }

  const unweighted = graded.filter((p) => p.weight === undefined);
  if (unweighted.length > 0) {
    d.warn(
      `course score weighting: these pages are graded without a pageConfig.weight, ` +
        `so each counts as 1 against pages that ` +
        `declare one: ${unweighted.map((p) => p.fileRel).join(', ')}`,
    );
  }

  if (graded.length < 2 || required.length === 0) return;
  // Percentage-style or all-fractional weights imply a scale to land on; bare
  // ratios like 2 and 3 imply none, so their total is never a typo.
  const weights = required.map(weightOf);
  const scale = weights.some((w) => w >= 5)
    ? 100
    : weights.every((w) => w < 1)
      ? 1
      : undefined;
  if (scale !== undefined && Math.abs(total - scale) > scale * 1e-6) {
    const excluded =
      optional.length > 0 ? ' The total leaves out the optional pages.' : '';
    d.warn(
      `course score weights sum to ${Number(total.toFixed(4))}, not ${scale}, and are scaled to that total. ` +
        `Add up to ${scale} to make each weight the page's percentage of the course score, ` +
        `or ignore this if the weights are meant as bare ratios.${excluded}`,
    );
  }
}

export function crossValidate(
  config: ParsedConfig,
  pageResults: PagesValidationResult,
  d: Diagnostics,
  profile: StandardProfile | undefined,
): void {
  const quizMode = config.completion?.mode === 'quiz';
  const hasGraded = pageResults.pages.some((p) => p.graded);
  const hasRequiredGraded = pageResults.pages.some((p) => p.requiredGraded);
  // A quiz verdict judges the graded average against the threshold whether
  // `success` names it or `completion.mode` implies it, so read the resolved
  // criterion. With nothing graded there is no average and nothing reads it.
  const judgesScore = hasGraded && resolveSuccess(config).from === 'quiz';
  const quizVerdict = config.success?.from === 'quiz';

  if (!hasRequiredGraded && !pageResults.hasParseErrors) {
    if (quizMode) {
      d.error(
        hasGraded
          ? 'completion.mode is "quiz" but every graded page sets required: false, so the course can never complete. ' +
              'Drop required from the page that decides the course, or complete on something else.'
          : 'completion.mode is "quiz" but no pages declare quiz: { graded: true } or graded: true',
      );
    } else if (judgesScore) {
      d.warn(
        'every graded page sets required: false, so a learner who skips them all is never judged ' +
          'and the verdict stays "unknown". Use success: { from: "none" } if the score is all the ' +
          'course reports, or drop required from the page that gates credit.',
      );
    } else if (quizVerdict) {
      d.warn(
        'success.from is "quiz" but no pages declare quiz: { graded: true } or graded: true, so the LMS will never get a passed/failed.',
      );
    }
  }

  // A threshold something reads with nothing set: the merge defaults to 70, so
  // this is a nudge, not an error. Quiz mode always reads it for completion,
  // whatever judges success.
  if (config.scoring?.passingScore === undefined && (quizMode || judgesScore)) {
    d.warn(
      `${quizMode ? 'completion.mode is "quiz"' : 'the course judges pass/fail on the graded average'} but scoring.passingScore is not set, so it defaults to 70%. Set it explicitly to be sure.`,
    );
  }

  if (!pageResults.hasParseErrors) reportEffectiveWeights(pageResults, d);

  const isManual = config.completion?.mode === 'manual';
  const completesOnPages = pageResults.pages.filter((p) => p.completesOnView);

  if (
    isManual &&
    config.completion?.trigger === 'page' &&
    completesOnPages.length === 0 &&
    !pageResults.hasParseErrors
  ) {
    d.error(
      'completion.mode is "manual" with trigger: "page", but no page declares pageConfig.completesOn: "view". ' +
        'Either add a completesOn page or remove the trigger field to drop the static check.',
    );
  }

  if (isManual && !quizVerdict) {
    for (const page of pageResults.pages) {
      if (page.graded) {
        d.warn(
          `${page.fileRel}: the page is graded under completion.mode: "manual". ` +
            'The score will be reported to the LMS for transcripts, but it will not drive ' +
            "completion or success status — `markComplete()` / completesOn does. If that's " +
            'not what you want, set graded: false, add success: { from: "quiz" } to judge ' +
            'it, or change completion.mode.',
        );
      }
    }
  }

  if (isManual && config.completion?.percentageThreshold !== undefined) {
    d.warn(
      'course.config.js: "completion.percentageThreshold" is ignored under completion.mode: "manual"',
    );
  }
  if (!isManual) {
    for (const page of completesOnPages) {
      d.warn(
        `${page.fileRel}: pageConfig.completesOn is ignored — completion.mode is "${config.completion?.mode ?? 'percentage'}"`,
      );
    }
  }
  for (const page of pageResults.pages) {
    if (page.completesOnView && page.hasQuiz) {
      d.warn(
        `${page.fileRel}: completion fires on view, before the quiz can be answered — likely a mistake`,
      );
    }
  }

  if (isManual) {
    const firstPage = pageResults.pages[0];
    if (firstPage?.completesOnView) {
      d.warn(
        `${firstPage.fileRel}: pageConfig.completesOn: "view" is on the first page — the course will complete immediately on launch, before the learner sees any other content.`,
      );
    }
  }

  if (profile && 'suspendDataLimit' in profile) {
    // Estimate worst-case suspend_data size when all pages are visited, all
    // quizzes completed, all chunks revealed, and a modest amount of
    // usePersistence / standalone-question state has accumulated.
    //
    // SavedState shape (see runtime/persistence.ts) — single-letter keys:
    //   b (bookmark), v (visited[]), d (duration), c (chunk progress),
    //   g (per-page quiz + standalone scores), u (user state from usePersistence)
    //
    // We can't statically detect calls to `useQuestion({ graded: true })` or
    // `usePersistence`, so reserve a fixed buffer per page for those.
    const totalPages = pageResults.pages.length;
    const totalQuizzes = pageResults.pages.filter((p) => p.hasQuiz).length;
    let visitedChars = 0;
    for (let i = 0; i < totalPages; i++) {
      visitedChars += String(i).length + 1; // digit chars + comma
    }
    const overhead = 60; // top-level JSON overhead with all keys
    // The `g` entry wrapper is budgeted once in standaloneBytes; a quiz adds
    // only its own fields.
    const quizBytes = totalQuizzes * 14; // g entry: "s":100,"a":2,
    const chunkBytes = totalPages * 12; // c: "NNN":NN,
    const standaloneBytes = totalPages * 43; // g: "NNN":{"q":{"q1":[100,3,1],"q2":[40,3,1]}},
    const userStateBuffer = 256; // usePersistence headroom
    const estimatedSize =
      overhead +
      visitedChars +
      quizBytes +
      chunkBytes +
      standaloneBytes +
      userStateBuffer;

    const limit = profile.suspendDataLimit;
    if (estimatedSize > limit * 0.8) {
      d.warn(
        `Course has ${totalPages} pages with ${totalQuizzes} quizzes — estimated ${profile.name} suspend_data ~${estimatedSize} bytes may exceed the ${limit}-byte limit when fully populated (visited + chunks + standalone scores + usePersistence). Consider ${quoteList(largerSuspendDataStandards(limit))}.`,
      );
    }
  }
}
