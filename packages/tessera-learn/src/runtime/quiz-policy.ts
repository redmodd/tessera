/**
 * Quiz config desugaring. Authors pick feedback / retry behavior with string
 * enums in `pageConfig.quiz`; this module normalizes them into predicates so
 * `useQuiz` only ever interacts with the predicate API. Config is extracted
 * from source as a static object literal (JSON5), so only the enum forms are
 * representable — there are no function-valued options.
 */
import type { Interaction } from './interaction.js';
import type { QuizConfig } from './types.js';

export interface QuizQuestionResult {
  /** The original interaction reported for the question. */
  interaction: Interaction;
  /** Whether this question's response was correct. */
  correct: boolean;
  /** Per-question weight from `useQuestion({ weight })`. Defaults to 1. */
  weight: number;
}

/** State the feedback predicate decides over. */
export interface FeedbackVisibilityState {
  /** Index of the question being asked about. */
  questionIndex: number;
  /** Has `submit()` already fired for the current attempt? */
  submitted: boolean;
  /** Is the quiz currently in review mode? */
  reviewing: boolean;
  /** Has the question been answered (the shell called `setAnswer`)? */
  hasAnswered: boolean;
  /** Has the shell revealed feedback for this question via `revealFeedback`? */
  revealed: boolean;
  /** Number of times `submit()` has fired for this quiz instance. */
  attemptCount: number;
}

export type FeedbackModePredicate = (state: FeedbackVisibilityState) => boolean;
export type RetryStrategyPredicate = (results: QuizQuestionResult[]) => Set<number>;

/**
 * Resolve the configured feedback policy into the "should this question's
 * feedback be visible now?" predicate.
 *  - `'immediate'` — visible after the shell calls `revealFeedback(q)`, or in review.
 *  - `'review'` (default) — visible only while reviewing.
 *  - `'never'` — never visible (`useQuiz` short-circuits before calling here).
 */
export function resolveFeedbackMode(cfg: QuizConfig | undefined | null): FeedbackModePredicate {
  const mode = cfg?.feedbackMode;
  if (mode === 'immediate') return (s) => s.revealed || s.reviewing;
  if (mode === 'never') return () => false;
  return (s) => s.reviewing;
}

/**
 * Resolve the retry strategy into a predicate returning the set of question
 * indices to lock as "already correct" on the next attempt.
 *  - `'incorrect-only'` — keep questions the learner got right.
 *  - `'full'` (default) — reset everything.
 */
export function resolveRetryStrategy(cfg: QuizConfig | undefined | null): RetryStrategyPredicate {
  if (cfg?.retryMode === 'incorrect-only') {
    return (results) => {
      const locked = new Set<number>();
      results.forEach((r, i) => {
        if (r.correct) locked.add(i);
      });
      return locked;
    };
  }
  return () => new Set<number>();
}
