import { describe, it, expect, vi, afterEach } from 'vitest';
import { parseA11yArgs, runA11y } from '../src/plugin/a11y-cli.js';

const runAudit = vi.hoisted(() => vi.fn(async () => 0));
vi.mock('../src/plugin/a11y/audit.js', () => ({ runAudit }));

describe('parseA11yArgs', () => {
  it('defaults to no threshold and no rebuild', () => {
    expect(parseA11yArgs([])).toEqual({ ok: true, args: { rebuild: false } });
  });

  it('parses --threshold', () => {
    expect(parseA11yArgs(['--threshold', 'minor'])).toEqual({
      ok: true,
      args: { threshold: 'minor', rebuild: false },
    });
  });

  it('parses --build as rebuild', () => {
    expect(parseA11yArgs(['--build'])).toEqual({
      ok: true,
      args: { rebuild: true },
    });
  });

  it('rejects an invalid threshold', () => {
    const result = parseA11yArgs(['--threshold', 'nope']);
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.error).toContain('--threshold must be one of');
  });

  it('rejects unknown arguments', () => {
    const result = parseA11yArgs(['--wat']);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('Unknown argument: --wat');
  });
});

describe('runA11y', () => {
  afterEach(() => runAudit.mockClear());

  it('reuses an existing build by default', async () => {
    await runA11y('/proj', '/ws', []);
    expect(runAudit).toHaveBeenCalledWith('/proj', '/ws', { rebuild: false });
  });

  it('forces a rebuild when forceBuild is set (the check path)', async () => {
    await runA11y('/proj', '/ws', [], true);
    expect(runAudit).toHaveBeenCalledWith('/proj', '/ws', { rebuild: true });
  });
});
