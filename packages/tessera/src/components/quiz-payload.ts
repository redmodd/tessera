import type { Interaction } from '../runtime/interaction.js';

/**
 * Shape contributed by a question component when it registers with a `<Quiz>`.
 * `id` and `interaction` are opt-in: built-in components are migrated to provide
 * them in Phase 2, so older question shapes that omit them remain valid here.
 */
export interface QuizQuestionApi {
  id?: string;
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
 * Questions that do not yet expose `interaction()` are skipped — their score
 * still rolls up to the quiz total via `checkAnswer`, but per-interaction
 * reporting is opt-in for back-compat.
 */
export function buildQuizInteractions(
  questions: QuizQuestionApi[],
  answers: Map<number, unknown>
): QuizInteractionEntry[] {
  const entries: QuizInteractionEntry[] = [];
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    if (!q.interaction) continue;
    const interaction = q.interaction();
    if (!interaction) continue;
    entries.push({
      id: q.id ?? `q${i}`,
      interaction,
      correct: q.checkAnswer(answers.get(i)),
    });
  }
  return entries;
}
