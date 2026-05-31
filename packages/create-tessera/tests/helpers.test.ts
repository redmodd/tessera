import { describe, it, expect } from 'vitest';
import { parseArgs } from '../src/index.ts';

// validateProjectName / toTitleCase now live in tessera-learn (tessera-learn's
// project-name.test.ts owns their unit coverage); create-tessera imports them.
// scaffold.test.ts exercises the bundled result end-to-end.

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
