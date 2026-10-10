import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { buildInlineConfig } from '../src/plugin/inline-config.js';

describe('buildInlineConfig', () => {
  const courseRoot = '/ws/courses/getting-started';
  const workspaceRoot = '/ws';

  it('roots Vite at the course root', () => {
    const config = buildInlineConfig(courseRoot, workspaceRoot);
    expect(config.root).toBe(courseRoot);
  });

  it('maps $shared to <workspaceRoot>/shared', () => {
    const config = buildInlineConfig(courseRoot, workspaceRoot);
    const alias = (config.resolve?.alias ?? {}) as Record<string, string>;
    expect(alias.$shared).toBe(join(workspaceRoot, 'shared'));
  });

  it('allows the dev server to serve files from the workspace root', () => {
    const config = buildInlineConfig(courseRoot, workspaceRoot);
    expect(config.server?.fs?.allow).toContain(workspaceRoot);
  });
});
