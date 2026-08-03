import type { Plugin } from 'vite';
import { resolve } from 'node:path';
import { createOverridePlugin } from './override-plugin.js';
import { resolvePackageRoot } from './package-root.js';

export function tesseraQuizPlugin(): Plugin {
  const builtinQuiz = resolve(
    resolvePackageRoot(),
    'src',
    'components',
    'Quiz.svelte',
  );
  return createOverridePlugin({
    name: 'tessera:quiz',
    virtualId: 'virtual:tessera-quiz',
    projectFile: 'quiz.svelte',
    builtinFile: builtinQuiz,
  });
}
