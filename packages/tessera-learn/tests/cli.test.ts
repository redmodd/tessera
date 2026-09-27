import { describe, it, expect, vi } from 'vitest';
import { main } from '../src/plugin/cli.js';
import { printed } from './helpers.js';

describe('tessera CLI dispatcher', () => {
  it('returns non-zero and prints usage with no subcommand', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const code = await main([]);
    expect(code).toBe(1);
    expect(printed(err)).toContain('Usage: tessera');
  });

  it('returns non-zero and prints usage for an unknown subcommand', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const code = await main(['frobnicate']);
    expect(code).toBe(1);
    expect(printed(err)).toContain('Unknown command: frobnicate');
  });

  it('prints usage and exits 0 for --help on a subcommand', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    for (const argv of [
      ['a11y', '--help'],
      ['check', '-h'],
      ['new', '--help'],
      ['duplicate', '--help'],
      ['duplicate', 'src', '-h'],
      ['export', '--bogus', '--help'],
    ]) {
      log.mockClear();
      const code = await main(argv);
      expect(code).toBe(0);
      expect(printed(log)).toContain('Usage: tessera');
    }
  });

  it('lists each flag once, under the commands that take it', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await main(['--help']);
    const usage = printed(log);
    expect(usage).toMatch(/^export\/validate options:\n {2}--standard </m);
    expect(usage).toMatch(/^a11y\/check options:\n {2}--threshold <minor\|/m);
  });
});
