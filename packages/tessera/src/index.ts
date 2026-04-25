// ---- Components ----
export * from './components/index.js';
export { default as DefaultLayout } from './components/DefaultLayout.svelte';

// ---- Hooks ----
export {
  useQuestion,
  useNavigation,
  useProgress,
  usePersistence,
} from './runtime/hooks.svelte.js';

// ---- Types ----
export type {
  Interaction,
} from './runtime/interaction.js';
export { isCorrect } from './runtime/interaction.js';
export type {
  UseQuestionOptions,
  UseQuestionHandle,
} from './runtime/hooks.svelte.js';
