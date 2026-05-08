/**
 * Quiz config desugaring. Authors drive feedback / retry / submit-gating /
 * scoring with either string enums or predicate functions; this module
 * normalizes both forms into predicates so `useQuiz` only ever interacts
 * with the predicate API.
 */
import type { Interaction } from './interaction.js';

export interface QuizQuestionResult {
  /** The original interaction reported for the question. */
  interaction: Interaction;
  /** Whether this question's response was correct. */
  correct: boolean;
  /** Per-question weight from `useQuestion({ weight })`. Defaults to 1. */
  weight: number;
}

/**
 * State the feedback predicate is given so it can decide independently of
 * the string-enum branches inside `useQuiz`. The predicate is the single
 * source of truth — the enums (`'immediate'` / `'review'`) desugar into
 * predicates over this same state.
 */
export interface FeedbackVisibilityState {
  /** Index of the question being asked about. */
  questionIndex: number;
  /** Has `submit()` already fired for the current attempt? */
  submitted: boolean;
  /** Is the quiz currently in review mode? */
  reviewing: boolean;
  /** Has the question been answered (the shell called `setAnswer`)? */
  hasAnswered: boolean;
  /**
   * Has the shell explicitly revealed feedback for this question via
   * `revealFeedback(index)`? Lets `'immediate'` flows distinguish "answered
   * but not yet revealed" from "Check Answer button pressed."
   */
  revealed: boolean;
  /** Number of times `submit()` has fired for this quiz instance. */
  attemptCount: number;
}

export type FeedbackModePredicate = (state: FeedbackVisibilityState) => boolean;
export type RetryStrategyPredicate = (results: QuizQuestionResult[]) => Set<number>;
export type CanSubmitPredicate = (answeredCount: number, totalCount: number) => boolean;
export type ScorePredicate = (results: QuizQuestionResult[]) => number;

export interface QuizPolicyConfig {
  /**
   * Show feedback after each answer (`'immediate'`), only on the review screen
   * (`'review'`), or via a custom predicate `(state) => boolean` returning
   * whether feedback should currently be visible. Predicates receive a full
   * `FeedbackVisibilityState` so they can decide independently of the enum
   * branches — the enums themselves desugar to predicates over the same state.
   */
  feedbackMode?: 'immediate' | 'review' | FeedbackModePredicate;
  /**
   * On retry, clear every answer (`'full'`), preserve correct answers
   * (`'incorrect-only'`), or pass a custom predicate that takes the previous
   * attempt's results and returns the set of question indices to keep locked.
   */
  retryMode?: 'full' | 'incorrect-only' | RetryStrategyPredicate;
  /**
   * Custom gate for the Submit button. Defaults to "every registered
   * question has an answer". Predicates take (answered, total).
   */
  canSubmit?: CanSubmitPredicate;
  /**
   * Custom score formula. Defaults to weighted-correct percentage —
   * `Σ(weight × correct) / Σ(weight) × 100`. Authors must return a value in
   * 0–100; values outside that range warn in dev mode.
   */
  score?: ScorePredicate;
  /**
   * If false, feedback never renders even when `feedbackMode` says it should.
   * Mirrors the historical `showFeedback` flag.
   */
  showFeedback?: boolean;
}

/**
 * Resolve the configured feedback policy into a single predicate that owns
 * the "should this question's feedback be visible right now?" decision.
 *
 * The shipping enums desugar to:
 *  - `'immediate'` — visible after the shell calls `revealFeedback` for the
 *    question, OR while the quiz is in review mode.
 *  - `'review'` (default) — visible only while the quiz is in review mode.
 *
 * Predicates receive the full visibility state so they can encode any policy
 * — e.g. "only after first wrong attempt": `(s) => s.attemptCount > 0 && s.submitted`.
 *
 * The `showFeedback: false` global gate is applied separately by `useQuiz`
 * before this predicate runs.
 */
export function resolveFeedbackMode(cfg: QuizPolicyConfig | undefined | null): FeedbackModePredicate {
  const mode = cfg?.feedbackMode;
  if (typeof mode === 'function') return mode;
  if (mode === 'immediate') {
    return (s) => s.revealed || s.reviewing;
  }
  // Default + 'review'
  return (s) => s.reviewing;
}

function isDevMode(): boolean {
  return import.meta.env?.DEV === true;
}

/**
 * Resolve the configured retry strategy into a predicate that returns the
 * set of question indices to lock as "already correct" on the next attempt.
 *
 *  - `'full'` (default) — reset everything.
 *  - `'incorrect-only'` — keep questions the learner got right.
 *  - function — author decides per result.
 *
 * Author predicates are wrapped: a non-Set return turns into "lock nothing"
 * in production and throws in dev so the bug stays local. An author returning
 * `[0, 1]` instead of `new Set([0, 1])` would otherwise silently no-op the
 * lock and quietly break `'incorrect-only'`-style retries.
 */
export function resolveRetryStrategy(cfg: QuizPolicyConfig | undefined | null): RetryStrategyPredicate {
  const mode = cfg?.retryMode;
  if (typeof mode === 'function') {
    return (results) => {
      const raw = mode(results);
      if (!(raw instanceof Set)) {
        if (isDevMode()) {
          throw new TypeError(
            `[tessera] quiz retryMode predicate returned ${Object.prototype.toString.call(raw)}; ` +
              `expected a Set<number> of question indices to lock.`
          );
        }
        return new Set<number>();
      }
      return raw;
    };
  }
  if (mode === 'incorrect-only') {
    return (results) => {
      const locked = new Set<number>();
      results.forEach((r, i) => {
        if (r.correct) locked.add(i);
      });
      return locked;
    };
  }
  // Default 'full': clear every answer.
  return () => new Set<number>();
}

/**
 * Resolve the Submit gate. Default — all answered.
 *
 * Author predicates are wrapped: a non-boolean return is coerced with `!!` in
 * production and throws in dev. Authors returning `answered` (a number) would
 * otherwise enable Submit on `0` answered ↔ disable on a count that happens
 * to equal `NaN` — silently wrong gates either way.
 */
export function resolveCanSubmit(cfg: QuizPolicyConfig | undefined | null): CanSubmitPredicate {
  if (typeof cfg?.canSubmit === 'function') {
    const fn = cfg.canSubmit;
    return (answered, total) => {
      const raw = fn(answered, total);
      if (typeof raw !== 'boolean') {
        if (isDevMode()) {
          throw new TypeError(
            `[tessera] quiz canSubmit predicate returned ${typeof raw}; expected a boolean.`
          );
        }
        return !!raw;
      }
      return raw;
    };
  }
  return (answered, total) => total > 0 && answered >= total;
}

/**
 * Resolve the score formula. Default — weighted-correct percentage. With all
 * weights = 1 (the default for every existing course), the output equals the
 * pre-Phase-5 unweighted formula.
 */
export function resolveScore(cfg: QuizPolicyConfig | undefined | null): ScorePredicate {
  if (typeof cfg?.score === 'function') {
    return (results) => {
      const raw = cfg.score!(results);
      const isDev = isDevMode();
      if (typeof raw !== 'number' || !Number.isFinite(raw)) {
        // NaN/Infinity/non-number can't ride through to setScore(...) — the LMS
        // either rejects the cmi write or rolls it up to nonsense. Throw in dev
        // so the bug stays local; clamp to 0 in prod so a runaway predicate
        // can't crash the learner's session.
        if (isDev) {
          throw new TypeError(
            `[tessera] quiz score predicate returned ${String(raw)}; expected a finite number in 0–100.`
          );
        }
        return 0;
      }
      if (raw < 0 || raw > 100) {
        if (isDev) {
          // eslint-disable-next-line no-console
          console.warn(
            `[tessera] quiz score predicate returned ${raw}; expected a finite number in 0–100. ` +
              `Clamping to range — LMSes reject out-of-range cmi.score.raw values.`
          );
        }
        return Math.max(0, Math.min(100, raw));
      }
      return raw;
    };
  }
  return (results) => {
    if (results.length === 0) return 0;
    let weighted = 0;
    let totalWeight = 0;
    for (const r of results) {
      const w = r.weight > 0 ? r.weight : 1;
      totalWeight += w;
      if (r.correct) weighted += w;
    }
    if (totalWeight === 0) return 0;
    return Math.round((weighted / totalWeight) * 100);
  };
}
