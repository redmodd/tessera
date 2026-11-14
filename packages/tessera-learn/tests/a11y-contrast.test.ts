import { describe, it, expect } from 'vitest';
import { MATCH_PAIR_COLORS } from '../src/components/util.js';

function contrastOnWhite(hex: string): number {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) throw new Error(`not #rrggbb: ${hex}`);
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const WHITE_LUMINANCE = 1;
  return (WHITE_LUMINANCE + 0.05) / (luminance + 0.05);
}

describe('Matching pair colors', () => {
  it('give the white badge number AA contrast', () => {
    const failing = MATCH_PAIR_COLORS.filter((c) => contrastOnWhite(c) < 4.5);
    expect(failing).toEqual([]);
  });
});
