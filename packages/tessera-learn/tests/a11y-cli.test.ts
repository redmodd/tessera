import { describe, it, expect, vi, afterEach } from 'vitest';
import { parseA11yArgs, runA11y } from '../src/plugin/a11y-cli.js';

const runAudit = vi.hoisted(() => vi.fn(async () => 0));
vi.mock('../src/plugin/a11y/audit.js', () => ({ runAudit }));

describe('parseA11yArgs', () => {
  it('defaults to no threshold', () => {
    expect(parseA11yArgs([])).toEqual({ ok: true, args: {} });
  });

  it('parses --threshold', () => {
    expect(parseA11yArgs(['--threshold', 'minor'])).toEqual({
      ok: true,
      args: { threshold: 'minor' },
    });
  });

  it('rejects an invalid threshold', () => {
    const result = parseA11yArgs(['--threshold', 'nope']);
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.error).toContain('--threshold must be one of');
  });

  it('rejects --build (the audit always rebuilds now)', () => {
    const result = parseA11yArgs(['--build']);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('Unknown argument: --build');
  });

  it('rejects unknown arguments', () => {
    const result = parseA11yArgs(['--wat']);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('Unknown argument: --wat');
  });
});

describe('runA11y', () => {
  afterEach(() => runAudit.mockClear());

  it('passes the parsed threshold through to the audit', async () => {
    await runA11y('/proj', '/ws', ['--threshold', 'minor']);
    expect(runAudit).toHaveBeenCalledWith('/proj', '/ws', {
      threshold: 'minor',
    });
  });
});
