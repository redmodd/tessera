// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { applyBranding } from '../src/runtime/branding.js';

describe('applyBranding', () => {
  it('sets a parseable primary color', () => {
    const el = document.createElement('div');
    applyBranding(el, { primaryColor: '#b91c1c' });
    expect(el.style.getPropertyValue('--tessera-primary')).toBe('#b91c1c');
  });

  it('skips a primary color the browser cannot parse', () => {
    const el = document.createElement('div');
    applyBranding(el, { primaryColor: '#12345' });
    expect(el.style.getPropertyValue('--tessera-primary')).toBe('');
  });
});
