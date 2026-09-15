import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { readResolvedConfig } from '../src/plugin/manifest.js';
import { validateProject } from '../src/plugin/validation.js';

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
    expect(read.profile?.id).toBe('scorm12');
    expect(read.ok && read.config.export?.standard).toBe('scorm12');
  });

  it('defaults to web when the config omits export.standard', () => {
    writeConfig(`{ title: "x" }`);
    expect(readResolvedConfig(projectRoot).profile?.id).toBe('web');
  });

  it('lets a CLI override win while preserving other export fields', () => {
    writeConfig(`{ export: { standard: "web", csp: false } }`);
    const read = readResolvedConfig(projectRoot, 'cmi5');
    expect(read.profile?.id).toBe('cmi5');
    expect(read.ok && read.config.export).toEqual({
      standard: 'cmi5',
      csp: false,
    });
  });

  it('resolves no profile for an unreadable config with no override', () => {
    const read = readResolvedConfig(projectRoot);
    expect(read.ok).toBe(false);
    expect(read.profile).toBeUndefined();
  });

  it.each(['scorm13', ''])(
    'resolves no profile for a standard of "%s"',
    (standard) => {
      writeConfig(`{ export: { standard: "${standard}" } }`);
      expect(readResolvedConfig(projectRoot).profile).toBeUndefined();
    },
  );

  it('honours the override even when the config is unreadable', () => {
    const read = readResolvedConfig(projectRoot, 'scorm2004');
    expect(read.ok).toBe(false);
    expect(read.profile?.id).toBe('scorm2004');
  });
});

describe('validateProject standardOverride', () => {
  it('rejects an override outside the allowed set', () => {
    writeConfig(`{ export: { standard: "web" } }`);
    const { errors } = validateProject(projectRoot, 'scorm13' as never);
    expect(errors).toContainEqual(
      expect.stringContaining('standardOverride must be one of'),
    );
    expect(errors.some((e) => e.includes('course.config.js'))).toBe(false);
  });

  it('still rejects an invalid file standard when an override is given', () => {
    writeConfig(`{ export: { standard: "scorm13" } }`);
    const { errors } = validateProject(projectRoot, 'scorm12');
    expect(errors).toContainEqual(
      expect.stringContaining('"export.standard" must be one of'),
    );
  });

  it('accepts a valid override', () => {
    writeConfig(`{ export: { standard: "web" } }`);
    const { errors } = validateProject(projectRoot, 'cmi5');
    expect(errors.some((e) => e.includes('"export.standard"'))).toBe(false);
  });
});
