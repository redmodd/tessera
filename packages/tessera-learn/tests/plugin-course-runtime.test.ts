import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { normalizePath } from 'vite';

import { tesseraCourseRuntimePlugin } from '../src/plugin/course-runtime.js';
import { resolvedContext } from './helpers/plugin.js';

describe('tessera:course-runtime virtual module', () => {
  let projectRoot: string;

  beforeEach(() => {
    projectRoot = mkdtempSync(resolve(tmpdir(), 'tessera-course-runtime-'));
  });

  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true });
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
