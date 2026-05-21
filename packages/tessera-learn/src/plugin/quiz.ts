import type { Plugin } from 'vite';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createOverridePlugin } from './override-plugin.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Resolve the project's quiz shell. `projectRoot/quiz.svelte` overrides the
 * built-in `<Quiz>` if present; otherwise the built-in is used. The plugin
 * lives in `dist/plugin/quiz.js` after build and `src/plugin/quiz.ts` in
 * source — both put `Quiz.svelte` two levels up under `src/components/`.
 */
export function tesseraQuizPlugin(): Plugin {
  const packageRoot = resolve(__dirname, '..', '..');
  const builtinQuiz = resolve(packageRoot, 'src', 'components', 'Quiz.svelte').replace(/\\/g, '/');
  return createOverridePlugin({
    name: 'tessera:quiz',
    virtualId: 'virtual:tessera-quiz',
    projectFile: 'quiz.svelte',
    fallback: `export { default } from '${builtinQuiz}';`,
  });
}
