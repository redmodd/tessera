import { describe, it, expect, beforeEach } from 'vitest';
import { existsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { normalizePath } from 'vite';

import {
  LAYOUT_OVERRIDE,
  QUIZ_OVERRIDE,
  createOverridePlugin,
} from '../src/plugin/override-plugin.js';
import { resolvedContext } from './helpers/plugin.js';
import { tempDir } from './helpers.js';

describe('tessera:layout virtual module', () => {
  let projectRoot: string;

  beforeEach(() => {
    projectRoot = tempDir();
  });

  function makePlugin() {
    return createOverridePlugin(resolvedContext(projectRoot), LAYOUT_OVERRIDE);
  }

  it('load() returns null re-export when no layout.svelte exists', () => {
    const code = (makePlugin() as any).load.handler();
    expect(code).toMatch(/export\s+default\s+null/);
  });

  it('load() re-exports the project layout.svelte when present', () => {
    const layoutPath = resolve(projectRoot, 'layout.svelte');
    writeFileSync(layoutPath, '<div>custom layout</div>');

    const code = (makePlugin() as any).load.handler();

    expect(code).toContain(`from '${normalizePath(layoutPath)}'`);
    expect(code).toMatch(/export\s+\{\s*default\s*\}/);
  });
});

describe('tessera:quiz virtual module', () => {
  it('load() re-exports the built-in Quiz.svelte when no quiz.svelte exists', () => {
    const plugin = createOverridePlugin(
      resolvedContext(tempDir()),
      QUIZ_OVERRIDE,
    );
    const code = (plugin as any).load.handler();
    const path = /from '(.+)'/.exec(code)?.[1];
    expect(path).toMatch(/\/src\/components\/Quiz\.svelte$/);
    expect(existsSync(path!)).toBe(true);
  });
});
