import { describe, it, expect } from 'vitest';
import { MATCH_PAIR_COLORS } from '../src/components/util.js';

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

describe('Matching pair colors', () => {
  it('give the white badge number AA contrast', () => {
    const failing = MATCH_PAIR_COLORS.filter(
      (c) =>
        !(/^#[0-9a-f]{6}$/i.test(c) && 1.05 / (luminance(c) + 0.05) >= 4.5),
    );
    expect(failing).toEqual([]);
  });
});
