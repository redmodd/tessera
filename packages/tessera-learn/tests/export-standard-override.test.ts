import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { readResolvedConfig } from '../src/plugin/manifest.js';

let projectRoot: string;

beforeEach(() => {
  projectRoot = resolve(
    tmpdir(),
    `tessera-resolve-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  mkdirSync(projectRoot, { recursive: true });
});

afterEach(() => {
  if (existsSync(projectRoot))
    rmSync(projectRoot, { recursive: true, force: true });
});

function writeConfig(body: string) {
  writeFileSync(
    resolve(projectRoot, 'course.config.js'),
    `export default ${body};`,
    'utf-8',
  );
}

describe('readResolvedConfig', () => {
  it('uses the course config standard when no override is given', () => {
    writeConfig(`{ export: { standard: "scorm12" } }`);
    const read = readResolvedConfig(projectRoot);
    expect(read.standard).toBe('scorm12');
    expect(read.ok && read.config.export?.standard).toBe('scorm12');
  });

  it('defaults to web when the config omits export.standard', () => {
    writeConfig(`{ title: "x" }`);
    expect(readResolvedConfig(projectRoot).standard).toBe('web');
  });

  it('lets a CLI override win over the config standard', () => {
    writeConfig(`{ export: { standard: "web" } }`);
    const read = readResolvedConfig(projectRoot, 'cmi5');
    expect(read.standard).toBe('cmi5');
    expect(read.ok && read.config.export?.standard).toBe('cmi5');
  });

  it('applies the override while preserving other export fields', () => {
    writeConfig(`{ export: { standard: "web", csp: false } }`);
    const read = readResolvedConfig(projectRoot, 'cmi5');
    expect(read.ok && read.config.export).toEqual({
      standard: 'cmi5',
      csp: false,
    });
  });

  it('reports unknown for an unreadable config with no override', () => {
    const read = readResolvedConfig(projectRoot);
    expect(read.ok).toBe(false);
    expect(read.standard).toBe('unknown');
  });

  it('honours the override even when the config is unreadable', () => {
    const read = readResolvedConfig(projectRoot, 'scorm2004');
    expect(read.ok).toBe(false);
    expect(read.standard).toBe('scorm2004');
  });
});
