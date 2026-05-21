import type { Plugin } from 'vite';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createOverridePlugin } from './override-plugin.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export function tesseraQuizPlugin(): Plugin {
  // The plugin lives in `dist/plugin/quiz.js` after build and `src/plugin/quiz.ts`
  // in source — both put `Quiz.svelte` two levels up under `src/components/`.
  const packageRoot = resolve(__dirname, '..', '..');
  const builtinQuiz = resolve(packageRoot, 'src', 'components', 'Quiz.svelte');
  return createOverridePlugin({
    name: 'tessera:quiz',
    virtualId: 'virtual:tessera-quiz',
    projectFile: 'quiz.svelte',
    builtinFile: builtinQuiz,
  });
}
