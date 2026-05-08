import type { Plugin, ResolvedConfig, ViteDevServer } from 'vite';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const VIRTUAL_QUIZ_ID = 'virtual:tessera-quiz';
const RESOLVED_QUIZ_ID = '\0' + VIRTUAL_QUIZ_ID;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Resolve the project's quiz shell.
 * `projectRoot/quiz.svelte` overrides the built-in `<Quiz>` if it exists,
 * otherwise the built-in is used. Mirrors `tesseraLayoutPlugin` (Phase 3A).
 */
export function tesseraQuizPlugin(): Plugin {
  let projectRoot: string;
  // Resolve the built-in Quiz.svelte once. The plugin lives in
  // `dist/plugin/quiz.js` after build and `src/plugin/quiz.ts` in source —
  // both layouts put `Quiz.svelte` two levels up under `src/components/`.
  const packageRoot = resolve(__dirname, '..', '..');
  const builtinQuiz = resolve(packageRoot, 'src', 'components', 'Quiz.svelte');

  return {
    name: 'tessera:quiz',
    enforce: 'pre',

    configResolved(config: ResolvedConfig) {
      projectRoot = config.root;
    },

    resolveId(id) {
      if (id === VIRTUAL_QUIZ_ID) return RESOLVED_QUIZ_ID;
      return null;
    },

    load(id) {
      if (id !== RESOLVED_QUIZ_ID) return null;
      const userQuizPath = resolve(projectRoot, 'quiz.svelte');
      if (existsSync(userQuizPath)) {
        // Watch the user file so add/remove flips through HMR (see below).
        this.addWatchFile(userQuizPath);
        const normalized = userQuizPath.replace(/\\/g, '/');
        return `export { default } from '${normalized}';`;
      }
      const normalized = builtinQuiz.replace(/\\/g, '/');
      return `export { default } from '${normalized}';`;
    },

    configureServer(server: ViteDevServer) {
      const userQuizPath = resolve(projectRoot, 'quiz.svelte');
      // Only react to add/unlink — those flip the load() output between the
      // user quiz and the built-in. A `change` event leaves the resolved
      // module identical and is handled by Svelte's own HMR.
      server.watcher.on('all', (event, filePath) => {
        if (filePath !== userQuizPath) return;
        if (event !== 'add' && event !== 'unlink') return;
        const mod = server.moduleGraph.getModuleById(RESOLVED_QUIZ_ID);
        if (mod) server.moduleGraph.invalidateModule(mod);
        server.ws.send({ type: 'full-reload' });
      });
    },
  };
}
