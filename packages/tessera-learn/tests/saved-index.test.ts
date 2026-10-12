import { describe, it, expect } from 'vitest';
import { savedIndex } from '../src/components/util.js';

describe('savedIndex', () => {
  it('takes a saved index only from a whole number the question has', () => {
    const list = ['a', 'b'];

    expect(savedIndex('1', list)).toBe(1);
    expect(savedIndex(0, list)).toBe(0);
    for (const value of [null, '', ' ', [], [1], true, '0x1', '2', -1, 0.5]) {
      expect(() => savedIndex(value, list)).toThrow(RangeError);
    }
  });
});
