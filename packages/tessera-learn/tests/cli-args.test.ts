import { describe, it, expect } from 'vitest';
import { parseCliArgs, wantsHelp } from '../src/plugin/cli-args.js';

describe('wantsHelp', () => {
  it('finds --help or -h anywhere before --', () => {
    expect(wantsHelp(['--bogus', '-h'])).toBe(true);
    expect(wantsHelp(['a', '--help'])).toBe(true);
    expect(wantsHelp(['--', '-h'])).toBe(false);
    expect(wantsHelp(['a'])).toBe(false);
  });
});

describe('parseCliArgs', () => {
  it('treats arguments after -- as positionals', () => {
    expect(parseCliArgs(['--', '-h'])).toEqual({
      values: {},
      positionals: ['-h'],
    });
  });

  it('keeps only the first sentence of the error with its code', () => {
    expect(parseCliArgs(['--wat'])).toEqual({
      error: "Unknown option '--wat'",
      code: 'ERR_PARSE_ARGS_UNKNOWN_OPTION',
    });
  });
});
