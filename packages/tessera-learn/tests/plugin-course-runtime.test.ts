import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';

import { tesseraCourseRuntimePlugin } from '../src/plugin/course-runtime.js';

describe('tessera:course-runtime virtual module', () => {
  let projectRoot: string;

  beforeEach(() => {
    projectRoot = mkdtempSync(resolve(tmpdir(), 'tessera-course-runtime-'));
  });

  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true });
  });

  function load(): string {
    const plugin = tesseraCourseRuntimePlugin() as any;
    plugin.configResolved({ root: projectRoot });
    return plugin.load.call(
      { addWatchFile() {} },
      '\0virtual:tessera-course-runtime',
    );
  }

  it('default-exports the course.runtime.js module namespace when present', () => {
    const file = resolve(projectRoot, 'course.runtime.js');
    writeFileSync(file, 'export const canAccess = () => true;');
    const code = load();
    expect(code).toContain(
      `import * as mod from '${file.replace(/\\/g, '/')}'`,
    );
    expect(code).toContain('export default mod;');
  });
});
