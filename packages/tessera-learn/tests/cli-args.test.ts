import { describe, it, expect } from 'vitest';
import { parseCliArgs } from '../src/plugin/cli-args.js';

describe('parseCliArgs', () => {
  it('lets --help win over other arguments', () => {
    expect(parseCliArgs(['--bogus', '-h'])).toEqual({ help: true });
  });

  it('treats arguments after -- as positionals', () => {
    expect(parseCliArgs(['--', '-h'])).toEqual({
      help: false,
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
