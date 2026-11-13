import type { Plugin } from 'vite';
import { normalizePath } from 'vite';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { virtualModule } from './virtual-module.js';
import { resolvePackageRoot } from './package-root.js';
import type { BuildContext } from './build-context.js';

interface OverridePluginOptions {
  name: string;
  virtualId: string;
  projectFile: string;
  /** Package-relative built-in re-exported when the project file is absent; null export otherwise. */
  builtinFile?: string;
  /** Default-export the project file's module namespace, for files with named exports. */
  namespace?: boolean;
}

export const LAYOUT_OVERRIDE: OverridePluginOptions = {
  name: 'tessera:layout',
  virtualId: 'virtual:tessera-layout',
  projectFile: 'layout.svelte',
};

export const QUIZ_OVERRIDE: OverridePluginOptions = {
  name: 'tessera:quiz',
  virtualId: 'virtual:tessera-quiz',
  projectFile: 'quiz.svelte',
  builtinFile: 'src/components/Quiz.svelte',
};

export const COURSE_RUNTIME_OVERRIDE: OverridePluginOptions = {
  name: 'tessera:course-runtime',
  virtualId: 'virtual:tessera-course-runtime',
  projectFile: 'course.runtime.js',
  namespace: true,
};

/**
 * A virtual module that resolves to a project-root override file when present,
 * and to the built-in (or a null export) otherwise.
 */
export function createOverridePlugin(
  ctx: BuildContext,
  {
    name,
    virtualId,
    projectFile,
    builtinFile,
    namespace = false,
  }: OverridePluginOptions,
): Plugin {
  const fallback = builtinFile
    ? `export { default } from '${normalizePath(resolve(resolvePackageRoot(), builtinFile))}';`
    : 'export default null;';

  return virtualModule(
    name,
    virtualId,
    () => {
      const filePath = resolve(ctx.root, projectFile);
      if (!existsSync(filePath)) return fallback;
      const path = normalizePath(filePath);
      return namespace
        ? `import * as mod from '${path}';\nexport default mod;`
        : `export { default } from '${path}';`;
    },
    // Only create/delete swaps override vs fallback; Svelte HMR does updates.
    (type, file) =>
      type !== 'update' &&
      file === normalizePath(resolve(ctx.root, projectFile)),
  );
}
