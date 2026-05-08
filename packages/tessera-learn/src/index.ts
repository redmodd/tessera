// ---- Components ----
// `DefaultLayout` is included via the wildcard re-export.
export * from './components/index.js';

// ---- Hooks ----
export {
  useQuestion,
  useQuiz,
  useNavigation,
  useProgress,
  usePersistence,
} from './runtime/hooks.svelte.js';

// ---- Access ----
export {
  freeAccess,
  sequentialAccess,
  resolveAccess,
} from './runtime/access.js';
export type {
  AccessFn,
  AccessContext,
} from './runtime/access.js';

// ---- xAPI ----
export { useXAPI } from './runtime/xapi/registry.js';
export type { XAPIClient } from './runtime/xapi/client.js';
export type {
  XAPIAgent,
  XAPIVerb,
  XAPIObject,
  XAPIContext,
  XAPIResult,
  PartialStatement,
  Statement,
  DestinationOutcome,
  SendStatementResult,
  SendStatementOptions,
} from './runtime/xapi/types.js';

// ---- Types ----
export type {
  Interaction,
} from './runtime/interaction.js';
export { isCorrect } from './runtime/interaction.js';
export type {
  UseQuestionOptions,
  UseQuestionHandle,
  UseQuizHandle,
} from './runtime/hooks.svelte.js';
export type {
  XAPIConfig,
  XAPIExplicitConfig,
  XAPILMSConfig,
  CourseConfig,
} from './runtime/types.js';
