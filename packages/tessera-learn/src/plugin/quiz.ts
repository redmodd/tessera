import type { Plugin } from 'vite';
import { resolve } from 'node:path';
import { createOverridePlugin } from './override-plugin.js';

export function tesseraQuizPlugin(): Plugin {
  // The plugin lives in `dist/plugin/quiz.js` after build and `src/plugin/quiz.ts`
  // in source — both put `Quiz.svelte` two levels up under `src/components/`.
  const packageRoot = resolve(import.meta.dirname, '..', '..');
  const builtinQuiz = resolve(packageRoot, 'src', 'components', 'Quiz.svelte');
  return createOverridePlugin({
    name: 'tessera:quiz',
    virtualId: 'virtual:tessera-quiz',
    projectFile: 'quiz.svelte',
    builtinFile: builtinQuiz,
  });
}
