import { describe, it, expect } from 'vitest';
import { rgbToHsl } from '../src/runtime/branding.js';

describe('rgbToHsl', () => {
  it('converts primary blue', () => {
    expect(rgbToHsl(0, 102, 204)).toEqual({ h: 210, s: 100, l: 40 });
  });
  it('greyscale has zero saturation', () => {
    expect(rgbToHsl(128, 128, 128)).toEqual({ h: 0, s: 0, l: 50 });
  });
});
