import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  mkdirSync,
  writeFileSync,
  rmSync,
  existsSync,
  readdirSync,
} from 'node:fs';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { main } from '../src/plugin/cli.js';

const { runAudit, runBuild, runDev, runValidate } = vi.hoisted(() => ({
  runAudit: vi.fn(async () => 0),
  runBuild: vi.fn(async () => 0),
  runDev: vi.fn(async () => 0),
  runValidate: vi.fn(() => 0),
}));
vi.mock('../src/plugin/a11y/audit.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  runAudit,
}));
vi.mock('../src/plugin/build-commands.js', () => ({ runBuild, runDev }));
vi.mock('../src/plugin/validate-cli.js', () => ({ runValidate }));

let ws: string;
let course: string;
let counter = 0;

function makeWorkspace(courses: string[]): string {
  counter++;
  const root = resolve(tmpdir(), `tessera-cli-disp-${Date.now()}-${counter}`);
  mkdirSync(join(root, 'courses'), { recursive: true });
  for (const name of courses) {
    const dir = join(root, 'courses', name);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'course.config.js'), 'export default {};');
  }
  return root;
}

function stderr(): string {
  return vi.mocked(console.error).mock.calls.flat().join('\n');
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
  ws = makeWorkspace(['getting-started']);
  course = join(ws, 'courses', 'getting-started');
});

afterEach(() => {
  vi.restoreAllMocks();
  try {
    rmSync(ws, { recursive: true, force: true });
  } catch {}
});

describe('main dispatch', () => {
  it('dispatches `new` and scaffolds a course', async () => {
    const code = await main(['new', 'second'], ws);
    expect(code).toBe(0);
    expect(existsSync(join(ws, 'courses', 'second', 'course.config.js'))).toBe(
      true,
    );
  });

  it('errors when a command names a course that does not exist', async () => {
    const code = await main(['dev', 'nope'], ws);
    expect(code).toBe(1);
    expect(stderr()).toContain('[tessera dev] Course "nope" not found');
  });

  it('errors with the course list when a bare command is run at the workspace root', async () => {
    const code = await main(['dev'], ws);
    expect(code).toBe(1);
    expect(stderr()).toContain('getting-started');
  });

  it('passes --standard through to export', async () => {
    expect(
      await main(['export', 'getting-started', '--standard', 'scorm2004'], ws),
    ).toBe(0);
    expect(runBuild).toHaveBeenCalledWith(course, ws, 'scorm2004');
  });

  it('accepts flags before the course and the --flag=value form', async () => {
    expect(
      await main(['export', '--standard=web', 'getting-started'], ws),
    ).toBe(0);
    expect(runBuild).toHaveBeenCalledWith(course, ws, 'web');
  });

  it('passes --standard through to validate', async () => {
    expect(
      await main(['validate', 'getting-started', '--standard', 'cmi5'], ws),
    ).toBe(0);
    expect(runValidate).toHaveBeenCalledWith(course, {
      standardOverride: 'cmi5',
    });
  });

  it('passes the a11y threshold through to the audit', async () => {
    expect(
      await main(['a11y', 'getting-started', '--threshold', 'minor'], ws),
    ).toBe(0);
    expect(runAudit).toHaveBeenCalledWith(course, ws, { threshold: 'minor' });
  });

  it('runs validate, then the audit, for check', async () => {
    expect(
      await main(['check', 'getting-started', '--threshold=moderate'], ws),
    ).toBe(0);
    expect(runValidate).toHaveBeenCalledWith(course, { showA11yTip: false });
    expect(runAudit).toHaveBeenCalledWith(course, ws, {
      threshold: 'moderate',
    });
  });

  it('reports a flag-shaped value as a missing value', async () => {
    expect(
      await main(['export', 'getting-started', '--standard', '--wat'], ws),
    ).toBe(1);
    expect(stderr()).toBe('[tessera export] --standard requires a value');
  });

  it('skips the audit when check fails validation', async () => {
    runValidate.mockReturnValueOnce(1);
    expect(await main(['check', 'getting-started'], ws)).toBe(1);
    expect(runAudit).not.toHaveBeenCalled();
  });

  it.each([
    [['export', 'getting-started', '--standard', 'bogus'], 'got "bogus"'],
    [['validate', 'getting-started', '--standard=bogus'], 'got "bogus"'],
    [
      ['export', 'getting-started', '--standard'],
      '--standard requires a value',
    ],
    [
      ['export', 'getting-started', '--standard', 'web', '--standard', '--wat'],
      '--standard requires a value',
    ],
    [['export', 'getting-started', '--standrd', 'scorm2004'], "'--standrd'"],
    [
      ['a11y', 'getting-started', '--threshold', 'nope'],
      '--threshold must be one of',
    ],
    [['a11y', 'getting-started', '--build'], "Unknown option '--build'"],
    [
      ['a11y', 'getting-started', '--threshold'],
      '--threshold requires a value',
    ],
    [['a11y', 'nope', '--wat'], "[tessera a11y] Unknown option '--wat'"],
    [['dev', 'getting-started', '--standard', 'web'], "'--standard'"],
    [['check', 'getting-started', 'extra'], 'Unexpected argument: extra'],
    [['new', 'second', '--wat'], "Unknown option '--wat'"],
    [
      ['duplicate', 'getting-started', 'copy', 'extra'],
      'Unexpected argument: extra',
    ],
  ])('rejects %j before running anything', async (argv, message) => {
    expect(await main(argv, ws)).toBe(1);
    expect(stderr()).toContain(message);
    for (const run of [runAudit, runBuild, runDev, runValidate]) {
      expect(run).not.toHaveBeenCalled();
    }
    expect(readdirSync(join(ws, 'courses'))).toEqual(['getting-started']);
  });
});
