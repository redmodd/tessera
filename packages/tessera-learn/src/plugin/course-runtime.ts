import type { Plugin } from 'vite';
import { createOverridePlugin } from './override-plugin.js';
import type { BuildContext } from './build-context.js';

export function tesseraCourseRuntimePlugin(ctx: BuildContext): Plugin {
  return createOverridePlugin(ctx, {
    name: 'tessera:course-runtime',
    virtualId: 'virtual:tessera-course-runtime',
    projectFile: 'course.runtime.js',
    namespace: true,
  });
}
