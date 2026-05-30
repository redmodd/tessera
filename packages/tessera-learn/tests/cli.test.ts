import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { main, isMainEntry } from '../src/plugin/cli.js';

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
});

describe('isMainEntry', () => {
  let dir: string;
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it('matches when invoked through a symlink (pnpm/npm bin layout)', () => {
    dir = mkdtempSync(join(tmpdir(), 'tessera-cli-'));
    const real = join(dir, 'cli.js');
    const link = join(dir, 'cli-link.js');
    writeFileSync(real, '');
    symlinkSync(real, link);
    const metaUrl = pathToFileURL(realpathSync(real)).href;
    expect(isMainEntry(metaUrl, link)).toBe(true);
    expect(isMainEntry(metaUrl, real)).toBe(true);
  });

  it('does not match a different module or a missing argv', () => {
    dir = mkdtempSync(join(tmpdir(), 'tessera-cli-'));
    const real = join(dir, 'cli.js');
    writeFileSync(real, '');
    const metaUrl = pathToFileURL(realpathSync(real)).href;
    expect(isMainEntry(metaUrl, join(dir, 'other.js'))).toBe(false);
    expect(isMainEntry(metaUrl, undefined)).toBe(false);
  });
});
