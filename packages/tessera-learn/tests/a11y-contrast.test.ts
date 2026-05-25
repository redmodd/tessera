import { describe, it, expect } from 'vitest';
import {
  relativeLuminance,
  contrastRatio,
} from '../src/plugin/a11y/contrast.js';

describe('relativeLuminance', () => {
  it('is 0 for black and 1 for white', () => {
    expect(relativeLuminance('#000000')).toBeCloseTo(0, 5);
    expect(relativeLuminance('#ffffff')).toBeCloseTo(1, 5);
  });

  it('expands shorthand hex', () => {
    expect(relativeLuminance('#fff')).toBeCloseTo(1, 5);
    expect(relativeLuminance('#000')).toBeCloseTo(0, 5);
  });

  it('returns null for non-hex colors', () => {
    expect(relativeLuminance('rebeccapurple')).toBeNull();
    expect(relativeLuminance('rgb(0,0,0)')).toBeNull();
    expect(relativeLuminance('#12345')).toBeNull();
  });
});

describe('contrastRatio', () => {
  it('is 21:1 for black on white', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 1);
  });

  it('is order-independent', () => {
    const a = contrastRatio('#2563eb', '#ffffff');
    const b = contrastRatio('#ffffff', '#2563eb');
    expect(a).not.toBeNull();
    expect(a).toBeCloseTo(b as number, 10);
  });

  it('passes AA for the default primary on white (#2563eb)', () => {
    const ratio = contrastRatio('#2563eb', '#ffffff');
    expect(ratio).not.toBeNull();
    expect(ratio as number).toBeGreaterThanOrEqual(4.5);
  });

  it('fails AA for a light blue (#93c5fd) on white', () => {
    const ratio = contrastRatio('#93c5fd', '#ffffff');
    expect(ratio).not.toBeNull();
    expect(ratio as number).toBeLessThan(4.5);
  });

  it('returns null when either color is not hex', () => {
    expect(contrastRatio('blue', '#ffffff')).toBeNull();
    expect(contrastRatio('#ffffff', 'rgb(0,0,0)')).toBeNull();
  });
});
