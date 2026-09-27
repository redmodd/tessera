import { describe, it, expect, beforeEach } from 'vitest';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { normalizePath } from 'vite';

import { tesseraCourseRuntimePlugin } from '../src/plugin/course-runtime.js';
import { resolvedContext } from './helpers/plugin.js';
import { tempDir } from './helpers.js';

describe('tessera:course-runtime virtual module', () => {
  let projectRoot: string;

  beforeEach(() => {
    projectRoot = tempDir();
  });

  function load(): string {
    const plugin = tesseraCourseRuntimePlugin(resolvedContext(projectRoot));
    return (plugin as any).load.handler();
  }

  it('default-exports the course.runtime.js module namespace when present', () => {
    const file = resolve(projectRoot, 'course.runtime.js');
    writeFileSync(file, 'export const canAccess = () => true;');
    const code = load();
    expect(code).toContain(`import * as mod from '${normalizePath(file)}'`);
    expect(code).toContain('export default mod;');
  });
});
