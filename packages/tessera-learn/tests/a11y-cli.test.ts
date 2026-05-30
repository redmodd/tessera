import { describe, it, expect } from 'vitest';
import { parseA11yArgs } from '../src/plugin/a11y-cli.js';

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
