import { describe, it, expect, vi, afterEach } from 'vitest';
import { main } from '../src/plugin/cli.js';

afterEach(() => vi.restoreAllMocks());

describe('tessera CLI dispatcher', () => {
  it('returns non-zero and prints usage with no subcommand', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const code = await main([]);
    expect(code).toBe(1);
    expect(err.mock.calls.flat().join(' ')).toContain('Usage: tessera');
  });

  it('returns non-zero and prints usage for an unknown subcommand', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const code = await main(['frobnicate']);
    expect(code).toBe(1);
    expect(err.mock.calls.flat().join(' ')).toContain(
      'Unknown command: frobnicate',
    );
  });

  it('prints usage and exits 0 for --help on a subcommand', async () => {
    for (const argv of [
      ['a11y', '--help'],
      ['check', '-h'],
      ['new', '--help'],
      ['duplicate', '--help'],
      ['duplicate', 'src', '-h'],
    ]) {
      const log = vi.spyOn(console, 'log').mockImplementation(() => {});
      const code = await main(argv);
      expect(code).toBe(0);
      expect(log.mock.calls.flat().join(' ')).toContain('Usage: tessera');
      vi.restoreAllMocks();
    }
  });

  it('lists each flag once, under the commands that take it', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await main(['--help']);
    const usage = log.mock.calls.flat().join('\n');
    expect(usage).toMatch(/^export\/validate options:\n {2}--standard </m);
    expect(usage).toMatch(/^a11y\/check options:\n {2}--threshold <minor\|/m);
  });
});
