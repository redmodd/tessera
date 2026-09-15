import { describe, it, expect } from 'vitest';
import { parseA11yArgs } from '../src/plugin/a11y-cli.js';

describe('parseA11yArgs', () => {
  it('defaults to no threshold', () => {
    expect(parseA11yArgs([])).toEqual({});
  });

  it('parses --threshold', () => {
    expect(parseA11yArgs(['--threshold', 'minor'])).toEqual({
      threshold: 'minor',
    });
  });

  it('rejects an invalid threshold', () => {
    expect(parseA11yArgs(['--threshold', 'nope'])).toEqual({
      error: expect.stringContaining('--threshold must be one of'),
    });
  });

  it('rejects --build (the audit always rebuilds now)', () => {
    expect(parseA11yArgs(['--build'])).toEqual({
      error: 'Unknown argument: --build',
    });
  });

  it('rejects unknown arguments', () => {
    expect(parseA11yArgs(['--wat'])).toEqual({
      error: 'Unknown argument: --wat',
    });
  });
});
