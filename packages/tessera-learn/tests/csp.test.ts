import { describe, it, expect } from 'vitest';
import {
  buildCsp,
  isCspOverrides,
  WEB_CSP_BASELINE,
} from '../src/plugin/csp.js';

describe('buildCsp', () => {
  it('serializes the baseline unchanged when there are no overrides', () => {
    const csp = buildCsp();
    for (const [directive, sources] of Object.entries(WEB_CSP_BASELINE)) {
      expect(csp).toContain(`${directive} ${sources.join(' ')}`);
    }
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    // data: must stay out of frame-src (XSS-escalation vector).
    expect(csp).not.toContain("frame-src 'self' blob: data:");
  });

  it('appends override sources onto an existing directive (union)', () => {
    const csp = buildCsp({ 'font-src': ['https://fonts.gstatic.com'] });
    expect(csp).toContain("font-src 'self' data: https://fonts.gstatic.com");
  });

  it('dedupes a source already present in the baseline', () => {
    const csp = buildCsp({ 'connect-src': ['https:', 'https://lrs.example'] });
    // 'https:' is not re-added; the new origin is appended once.
    expect(csp).toContain("connect-src 'self' https: https://lrs.example");
  });

  it('adds a directive that is not in the baseline', () => {
    const csp = buildCsp({ 'manifest-src': ["'self'"] });
    expect(csp).toContain("manifest-src 'self'");
  });

  it('falls back to the baseline when overrides are malformed', () => {
    expect(buildCsp(42 as unknown)).toBe(buildCsp());
    expect(buildCsp({ 'font-src': 'https://x' } as unknown)).toBe(buildCsp());
    expect(buildCsp(null)).toBe(buildCsp());
  });
});

describe('isCspOverrides', () => {
  it('accepts an object of directive → string[]', () => {
    expect(isCspOverrides({ 'font-src': ['https://x'] })).toBe(true);
    expect(isCspOverrides({})).toBe(true);
  });

  it('rejects non-objects, arrays, and non-string-array values', () => {
    expect(isCspOverrides(false)).toBe(false);
    expect(isCspOverrides(null)).toBe(false);
    expect(isCspOverrides(['font-src'])).toBe(false);
    expect(isCspOverrides({ 'font-src': 'https://x' })).toBe(false);
    expect(isCspOverrides({ 'font-src': [1] })).toBe(false);
  });

  it('rejects sources or directive keys that would corrupt the policy', () => {
    // A ';' in a source would inject an adjacent directive once joined.
    expect(isCspOverrides({ 'font-src': ['https://x; script-src *'] })).toBe(
      false,
    );
    // Whitespace splits a single source into two.
    expect(isCspOverrides({ 'font-src': ["'self' https://x"] })).toBe(false);
    expect(isCspOverrides({ '': ["'self'"] })).toBe(false);
    expect(isCspOverrides({ 'font src': ["'self'"] })).toBe(false);
    // A " or > would break out of the content="..." meta attribute into markup.
    expect(
      isCspOverrides({ 'font-src': ['https://x"><script>alert(1)</script>'] }),
    ).toBe(false);
  });

  it('accepts the legitimate source forms', () => {
    for (const src of [
      "'self'",
      "'unsafe-inline'",
      "'none'",
      'https:',
      'data:',
      'blob:',
      'https://fonts.gstatic.com',
      "'nonce-abc123=='",
      "'sha256-AbC+/dEf='",
    ]) {
      expect(isCspOverrides({ 'font-src': [src] })).toBe(true);
    }
  });
});
