import { describe, it, expect } from 'vitest';
import { parseArgs } from '../src/index.js';

// validateProjectName / toTitleCase now live in tessera-learn (tessera-learn's
// project-name.test.ts owns their unit coverage); create-tessera imports them.
// scaffold.test.ts exercises the bundled result end-to-end.

describe('parseArgs', () => {
  it('returns help when --help is passed', () => {
    expect(parseArgs(['--help'])).toEqual({ help: true });
    expect(parseArgs(['-h'])).toEqual({ help: true });
    expect(parseArgs(['--bogus', '--help'])).toEqual({ help: true });
  });

  it('parses the workspace name', () => {
    expect(parseArgs(['my-course'])).toEqual({ projectName: 'my-course' });
    expect(parseArgs(['--', '-h'])).toEqual({ projectName: '-h' });
  });

  it('rejects unknown flags', () => {
    expect(parseArgs(['--version'])).toEqual({
      error: "Unknown option '--version'",
    });
    expect(parseArgs(['my-course', '--template=bare'])).toEqual({
      error: "Unknown option '--template'",
    });
  });

  it('rejects multiple positional arguments', () => {
    expect(parseArgs(['a', 'b'])).toEqual({
      error: 'Unexpected argument: b',
    });
  });
});
