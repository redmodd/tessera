import { describe, it, expect, beforeEach } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { readCourseConfig, resolveConfigRead } from '../src/plugin/manifest.js';
import { validateProject } from '../src/plugin/validation.js';
import { tesseraPlugin } from '../src/plugin/index.js';
import { tempDir } from './helpers.js';

let projectRoot: string;

beforeEach(() => {
  projectRoot = tempDir();
});

function readResolvedConfig(standardOverride?: 'cmi5' | 'scorm2004') {
  return resolveConfigRead(readCourseConfig(projectRoot), standardOverride);
}

function writeConfig(body: string) {
  writeFileSync(
    resolve(projectRoot, 'course.config.js'),
    `export default ${body};`,
    'utf-8',
  );
}

describe('resolveConfigRead', () => {
  it('uses the course config standard when no override is given', () => {
    writeConfig(`{ export: { standard: "scorm12" } }`);
    const read = readResolvedConfig();
    expect(read.profile?.id).toBe('scorm12');
    expect(read.ok && read.config.export?.standard).toBe('scorm12');
  });

  it('defaults to web when the config omits export.standard', () => {
    writeConfig(`{ title: "x" }`);
    expect(readResolvedConfig().profile?.id).toBe('web');
  });

  it('lets a CLI override win while preserving other export fields', () => {
    writeConfig(`{ export: { standard: "web", csp: false } }`);
    const read = readResolvedConfig('cmi5');
    expect(read.profile?.id).toBe('cmi5');
    expect(read.ok && read.config.export).toEqual({
      standard: 'cmi5',
      csp: false,
    });
  });

  it('replaces a non-object export with the override', () => {
    writeConfig(`{ export: "scorm12" }`);
    const read = readResolvedConfig('cmi5');
    expect(read.ok && read.config.export).toEqual({ standard: 'cmi5' });
  });

  it('drops a non-object section and resolves the default standard', () => {
    writeConfig(
      `{ title: "x", navigation: "sequential", completion: "manual", scoring: 70, export: "scorm12" }`,
    );
    const read = readResolvedConfig();
    expect(read.ok && read.config).toEqual({ title: 'x' });
    expect(read.profile?.id).toBe('web');
  });

  it('resolves no profile for an unreadable config with no override', () => {
    const read = readResolvedConfig();
    expect(read.ok).toBe(false);
    expect(read.profile).toBeUndefined();
  });

  it.each(['scorm13', ''])(
    'resolves no profile for a standard of "%s"',
    (standard) => {
      writeConfig(`{ export: { standard: "${standard}" } }`);
      expect(readResolvedConfig().profile).toBeUndefined();
    },
  );

  it('honours the override even when the config is unreadable', () => {
    const read = readResolvedConfig('scorm2004');
    expect(read.ok).toBe(false);
    expect(read.profile?.id).toBe('scorm2004');
  });
});

describe('tesseraPlugin standardOverride', () => {
  it('rejects an override outside the allowed set', () => {
    expect(() => tesseraPlugin({ standardOverride: 'scorm13' })).toThrow(
      /standardOverride must be ".*", got "scorm13"/,
    );
  });

  it.each([undefined, ''])('treats %j as no override', (standardOverride) => {
    expect(() => tesseraPlugin({ standardOverride })).not.toThrow();
  });
});

describe('validateProject standardOverride', () => {
  it('still rejects an invalid file standard when an override is given', () => {
    writeConfig(`{ export: { standard: "scorm13" } }`);
    const { errors } = validateProject(projectRoot, 'scorm12');
    expect(errors).toContainEqual(
      expect.stringContaining('"export.standard" must be "'),
    );
  });

  it('accepts a valid override', () => {
    writeConfig(`{ export: { standard: "web" } }`);
    const { errors } = validateProject(projectRoot, 'cmi5');
    expect(errors.some((e) => e.includes('"export.standard"'))).toBe(false);
  });

  it('applies the override to page checks when the config does not parse', () => {
    writeFileSync(
      resolve(projectRoot, 'course.config.js'),
      'export default {',
      'utf-8',
    );
    const sectionDir = resolve(projectRoot, 'pages', '01-intro');
    mkdirSync(sectionDir, { recursive: true });
    writeFileSync(
      resolve(sectionDir, '01-page.svelte'),
      `<script>import { MultipleChoice } from 'tessera-learn';</script>
<MultipleChoice id="my question" question="Q" options={["a", "b"]} correct={0} />`,
      'utf-8',
    );
    const { warnings } = validateProject(projectRoot, 'scorm12');
    expect(warnings).toContainEqual(
      expect.stringContaining(
        'question id "my question" will be rewritten to "my_question" for SCORM 1.2',
      ),
    );
  });
});
