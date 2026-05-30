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
    ]) {
      const log = vi.spyOn(console, 'log').mockImplementation(() => {});
      const code = await main(argv);
      expect(code).toBe(0);
      expect(log.mock.calls.flat().join(' ')).toContain('Usage: tessera');
      vi.restoreAllMocks();
    }
  });
});
