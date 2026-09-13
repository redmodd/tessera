import type { Plugin } from 'vite';
import { createOverridePlugin } from './override-plugin.js';

export function tesseraCourseRuntimePlugin(): Plugin {
  return createOverridePlugin({
    name: 'tessera:course-runtime',
    virtualId: 'virtual:tessera-course-runtime',
    projectFile: 'course.runtime.js',
    namespace: true,
  });
}
