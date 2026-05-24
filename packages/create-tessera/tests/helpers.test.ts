import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  parseArgs,
  validateProjectName,
  toTitleCase,
  detectPackageManager,
  FRAMEWORK_SCRIPTS,
} from '../src/index.ts';

const PKG_ROOT = resolve(__dirname, '..');

describe('parseArgs', () => {
  it('returns help when --help is passed', () => {
    expect(parseArgs(['--help'])).toEqual({ help: true });
    expect(parseArgs(['-h'])).toEqual({ help: true });
  });

  it('defaults the template to "default"', () => {
    expect(parseArgs(['my-course']).args).toEqual({
      projectName: 'my-course',
      template: 'default',
    });
  });

  it('accepts --template=bare', () => {
    expect(parseArgs(['my-course', '--template=bare']).args).toEqual({
      projectName: 'my-course',
      template: 'bare',
    });
  });

  it('rejects unknown templates', () => {
    expect(parseArgs(['x', '--template=fancy']).error).toMatch(
      /Unknown template/,
    );
  });

  it('rejects unknown flags', () => {
    expect(parseArgs(['--version']).error).toMatch(/Unknown option/);
  });

  it('rejects multiple positional arguments', () => {
    expect(parseArgs(['a', 'b']).error).toMatch(/Unexpected argument/);
  });
});

describe('validateProjectName', () => {
  it('accepts valid names', () => {
    expect(validateProjectName('my-course')).toBeNull();
    expect(validateProjectName('my_course')).toBeNull();
    expect(validateProjectName('course.v2')).toBeNull();
    expect(validateProjectName('a')).toBeNull();
  });

  it('rejects empty names', () => {
    expect(validateProjectName('')).toMatch(/required/);
  });

  it('rejects uppercase', () => {
    expect(validateProjectName('MyCourse')).toMatch(/lowercase/);
  });

  it('rejects names that do not start with a letter or digit', () => {
    expect(validateProjectName('-leading-dash')).toMatch(/start with/);
    expect(validateProjectName('.leading-dot')).toMatch(/start with/);
    expect(validateProjectName('_leading-underscore')).toMatch(/start with/);
  });

  it('rejects disallowed characters', () => {
    expect(validateProjectName('with space')).toMatch(/may only contain/);
    expect(validateProjectName('with/slash')).toMatch(/may only contain/);
    expect(validateProjectName('with@at')).toMatch(/may only contain/);
  });

  it('rejects names longer than 214 characters', () => {
    expect(validateProjectName('a'.repeat(215))).toMatch(/214/);
    expect(validateProjectName('a'.repeat(214))).toBeNull();
  });
});

describe('toTitleCase', () => {
  it('splits on dashes, underscores, dots, and whitespace', () => {
    expect(toTitleCase('my-awesome-course')).toBe('My Awesome Course');
    expect(toTitleCase('my_course')).toBe('My Course');
    expect(toTitleCase('course.v2')).toBe('Course V2');
    expect(toTitleCase('a b c')).toBe('A B C');
  });

  it('drops empty segments from runs of separators', () => {
    expect(toTitleCase('foo--bar')).toBe('Foo Bar');
  });

  it('titlecases validated names to characters safe to embed unescaped', () => {
    const names = [
      'my-course',
      'my_course',
      'course.v2',
      'a.b-c_d',
      '1course',
      'x',
    ];
    for (const n of names) {
      expect(validateProjectName(n)).toBeNull();
      expect(toTitleCase(n)).toMatch(/^[A-Za-z0-9 ]*$/);
    }
  });
});

describe('detectPackageManager', () => {
  const original = process.env.npm_config_user_agent;
  afterEach(() => {
    if (original === undefined) delete process.env.npm_config_user_agent;
    else process.env.npm_config_user_agent = original;
  });

  function withUA(ua: string | undefined) {
    if (ua === undefined) delete process.env.npm_config_user_agent;
    else process.env.npm_config_user_agent = ua;
    return detectPackageManager();
  }

  it('detects pnpm', () => {
    expect(withUA('pnpm/9.0.0 npm/? node/v24.0.0')).toBe('pnpm');
  });
  it('detects yarn', () => {
    expect(withUA('yarn/4.1.0 npm/? node/v24.0.0')).toBe('yarn');
  });
  it('detects bun', () => {
    expect(withUA('bun/1.1.0 npm/? node/v24.0.0')).toBe('bun');
  });
  it('detects npm', () => {
    expect(withUA('npm/10.5.0 node/v24.0.0')).toBe('npm');
  });
  it('falls back to npm when the user agent is empty or unset', () => {
    expect(withUA('')).toBe('npm');
    expect(withUA(undefined)).toBe('npm');
  });
});

describe('template ⇄ code invariants', () => {
  it('base/package.json scripts match FRAMEWORK_SCRIPTS', () => {
    const pkg = JSON.parse(
      readFileSync(resolve(PKG_ROOT, 'templates/base/package.json'), 'utf-8'),
    );
    expect(pkg.scripts).toEqual(FRAMEWORK_SCRIPTS);
  });

  it('files upgrade reads verbatim are token-free', () => {
    const TOKEN = /__(PROJECT_NAME|PROJECT_TITLE|TESSERA_VERSION)__/;
    for (const f of ['templates/base/vite.config.js', 'AGENTS.md']) {
      expect(TOKEN.test(readFileSync(resolve(PKG_ROOT, f), 'utf-8'))).toBe(
        false,
      );
    }
  });
});
