import type { Plugin } from 'vite';
import { resolve } from 'node:path';
import { createOverridePlugin } from './override-plugin.js';
import type { BuildContext } from './build-context.js';
import { resolvePackageRoot } from './package-root.js';

export function tesseraQuizPlugin(ctx: BuildContext): Plugin {
  const builtinQuiz = resolve(
    resolvePackageRoot(),
    'src',
    'components',
    'Quiz.svelte',
  );
  return createOverridePlugin(ctx, {
    name: 'tessera:quiz',
    virtualId: 'virtual:tessera-quiz',
    projectFile: 'quiz.svelte',
    builtinFile: builtinQuiz,
  });
}
