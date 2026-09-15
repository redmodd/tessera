import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { main, splitCourseArg, parseExportFlags } from '../src/plugin/cli.js';

const runAudit = vi.hoisted(() => vi.fn(async () => 0));
vi.mock('../src/plugin/a11y/audit.js', () => ({ runAudit }));

describe('parseExportFlags', () => {
  it('returns no override when --standard is absent', () => {
    expect(parseExportFlags([])).toEqual({});
  });

  it('extracts a valid --standard value', () => {
    expect(parseExportFlags(['--standard', 'scorm2004'])).toEqual({
      standardOverride: 'scorm2004',
    });
  });

  it('accepts web as a standard override', () => {
    expect(parseExportFlags(['--standard', 'web'])).toEqual({
      standardOverride: 'web',
    });
  });

  it('errors on an unknown standard value', () => {
    expect(parseExportFlags(['--standard', 'bogus'])).toEqual({
      error: expect.stringContaining('bogus'),
    });
  });

  it('errors when --standard has no value', () => {
    expect(parseExportFlags(['--standard'])).toEqual({
      error: '--standard requires a value',
    });
  });

  it('accepts the --standard=value form', () => {
    expect(parseExportFlags(['--standard=scorm2004'])).toEqual({
      standardOverride: 'scorm2004',
    });
  });

  it('errors on an unknown standard given as --standard=value', () => {
    expect(parseExportFlags(['--standard=bogus'])).toEqual({
      error: expect.stringContaining('bogus'),
    });
  });

  it('rejects an unrecognized flag instead of ignoring it', () => {
    expect(parseExportFlags(['--standrd', 'scorm2004'])).toEqual({
      error: 'Unknown argument: --standrd',
    });
  });
});

describe('splitCourseArg', () => {
  it('treats a leading non-flag token as the course name', () => {
    expect(splitCourseArg(['getting-started'])).toEqual({
      course: 'getting-started',
      flags: [],
    });
  });

  it('keeps flags after the course name', () => {
    expect(
      splitCourseArg(['getting-started', '--threshold', 'serious']),
    ).toEqual({ course: 'getting-started', flags: ['--threshold', 'serious'] });
  });

  it('does not mistake a flag value for the course name', () => {
    expect(splitCourseArg(['--threshold', 'serious'])).toEqual({
      course: undefined,
      flags: ['--threshold', 'serious'],
    });
  });

  it('handles an empty arg list', () => {
    expect(splitCourseArg([])).toEqual({ course: undefined, flags: [] });
  });
});

let ws: string;
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

beforeEach(() => {
  runAudit.mockClear();
  ws = makeWorkspace(['getting-started']);
});

afterEach(() => {
  vi.restoreAllMocks();
  try {
    rmSync(ws, { recursive: true, force: true });
  } catch {}
});

describe('main dispatch', () => {
  it('dispatches `new` and scaffolds a course', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const code = await main(['new', 'second'], ws);
    expect(code).toBe(0);
    expect(existsSync(join(ws, 'courses', 'second', 'course.config.js'))).toBe(
      true,
    );
  });

  it('errors when a command names a course that does not exist', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const code = await main(['dev', 'nope'], ws);
    expect(code).toBe(1);
    expect(err.mock.calls.flat().join(' ')).toContain('nope');
  });

  it('errors with the course list when a bare command is run at the workspace root', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const code = await main(['dev'], ws);
    expect(code).toBe(1);
    expect(err.mock.calls.flat().join(' ')).toContain('getting-started');
  });

  it('rejects export with an invalid --standard before building', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const code = await main(
      ['export', 'getting-started', '--standard', 'bogus'],
      ws,
    );
    expect(code).toBe(1);
    expect(err.mock.calls.flat().join(' ')).toContain('bogus');
  });

  it('passes the parsed a11y threshold through to the audit', async () => {
    const code = await main(
      ['a11y', 'getting-started', '--threshold', 'minor'],
      ws,
    );
    expect(code).toBe(0);
    expect(runAudit).toHaveBeenCalledWith(
      expect.stringContaining('getting-started'),
      expect.any(String),
      { threshold: 'minor' },
    );
  });

  it('rejects a11y flags before resolving the course', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const code = await main(['a11y', 'nope', '--wat'], ws);
    expect(code).toBe(1);
    expect(err.mock.calls.flat().join(' ')).toContain(
      '[tessera a11y] Unknown argument: --wat',
    );
    expect(runAudit).not.toHaveBeenCalled();
  });

  it('rejects validate with an invalid --standard', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const code = await main(
      ['validate', 'getting-started', '--standard', 'bogus'],
      ws,
    );
    expect(code).toBe(1);
    expect(err.mock.calls.flat().join(' ')).toContain('bogus');
  });
});
