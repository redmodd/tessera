import { untrack } from 'svelte';
import type { UseQuestionOptions } from '../runtime/hooks.svelte.js';

/** The props every built-in question widget takes. */
export interface QuestionProps extends Pick<
  UseQuestionOptions,
  'id' | 'graded' | 'weight' | 'maxRetries'
> {
  question: string;
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
