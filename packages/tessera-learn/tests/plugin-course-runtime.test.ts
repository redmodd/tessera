import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { normalizePath } from 'vite';

import { tesseraCourseRuntimePlugin } from '../src/plugin/course-runtime.js';
import { BuildContext } from '../src/plugin/build-context.js';

describe('tessera:course-runtime virtual module', () => {
  let projectRoot: string;

  beforeEach(() => {
    projectRoot = mkdtempSync(resolve(tmpdir(), 'tessera-course-runtime-'));
  });

  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true });
  });

  function load(): string {
    const ctx = new BuildContext();
    ctx.resolve({ root: projectRoot, build: { outDir: 'dist' } } as never);
    return (tesseraCourseRuntimePlugin(ctx) as any).load.handler();
  }

  it('default-exports the course.runtime.js module namespace when present', () => {
    const file = resolve(projectRoot, 'course.runtime.js');
    writeFileSync(file, 'export const canAccess = () => true;');
    const code = load();
    expect(code).toContain(`import * as mod from '${normalizePath(file)}'`);
    expect(code).toContain('export default mod;');
  });
});
