// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { applyBranding } from '../src/runtime/branding.js';

describe('applyBranding', () => {
  it('sets a parseable primary color', () => {
    const el = document.createElement('div');
    applyBranding(el, { primaryColor: '#b91c1c' });
    expect(el.style.getPropertyValue('--tessera-primary')).toBe('#b91c1c');
  });

  it('skips and reports a primary color the browser cannot parse', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const el = document.createElement('div');
    applyBranding(el, { primaryColor: 'rgb(1,2)' });
    expect(el.style.getPropertyValue('--tessera-primary')).toBe('');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('rgb(1,2)'));
    warn.mockRestore();
  });
});
