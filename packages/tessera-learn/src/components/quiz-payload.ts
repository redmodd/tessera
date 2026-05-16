import type { Interaction } from '../runtime/interaction.js';

/**
 * Shape contributed by a question component when it registers with a quiz.
 * `useQuestion` always supplies both `id` and `interaction`; custom widgets
 * may omit `interaction` (presentational steps that don't report to the LMS),
 * in which case they're skipped by `buildQuizInteractions`.
 */
export interface QuizQuestionApi {
  id: string;
  /** Optional weight for the score rollup. Default 1 — `Σ(w·correct)/Σ(w)·100`. */
  weight?: number;
  checkAnswer: (answer: unknown) => boolean;
  reset?: () => void;
  render?: unknown;
  interaction?: () => Interaction;
}

export interface QuizInteractionEntry {
  id: string;
  interaction: Interaction;
  correct: boolean;
}

/**
 * Build the per-question payload included in `tessera-quiz-complete`.
 *
 * Skips questions whose `interaction` is missing or returns nullish — custom
 * widgets may register without an interaction reporter (e.g. presentational
 * "press to continue" steps), and those simply don't contribute to the
 * `cmi.interactions` / xAPI Answered stream.
 */
export function buildQuizInteractions(
  questions: QuizQuestionApi[],
  answers: Map<number, unknown>
): QuizInteractionEntry[] {
  const entries: QuizInteractionEntry[] = [];
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    if (typeof q.interaction !== 'function') continue;
    const interaction = q.interaction();
    if (!interaction) continue;
    entries.push({
      id: q.id,
      interaction,
      correct: q.checkAnswer(answers.get(i)),
    });
  }
  return entries;
}
