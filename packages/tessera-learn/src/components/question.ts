import { onMount, untrack } from 'svelte';
import type {
  UseQuestionHandle,
  UseQuestionOptions,
} from '../runtime/hooks.svelte.js';

/** The props every built-in question widget takes. */
interface QuestionProps {
  id: string;
  question: string;
  graded?: boolean;
  weight?: number;
  maxRetries?: number;
}

/**
 * A built-in widget's `useQuestion` options. `id` and `text` stay live;
 * `graded`, `weight` and `maxRetries` are read once, at setup.
 */
export function questionOptions(
  props: () => QuestionProps,
  own: Pick<UseQuestionOptions, 'response' | 'complete' | 'reset' | 'restore'>,
): UseQuestionOptions {
  const { graded, weight, maxRetries } = untrack(props);
  return {
    get id() {
      return props().id;
    },
    get text() {
      return props().question;
    },
    graded,
    weight,
    maxRetries,
    ...own,
  };
}

/** Runs `init` now when standalone, or on mount inside a quiz. */
export function initQuestion(q: UseQuestionHandle, init: () => void): void {
  if (q.mode === 'quiz') onMount(init);
  else init();
}
