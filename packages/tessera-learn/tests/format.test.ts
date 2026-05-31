import { describe, it, expect } from 'vitest';
import {
  formatHHMMSS,
  formatISO8601Duration,
  formatISO8601Timestamp,
  formatReal107,
} from '../src/runtime/adapters/format.js';

describe('formatISO8601Timestamp', () => {
  it('emits zone-free, second-resolution dateTime per SCORM 2004 §5.3.3', () => {
    const d = new Date('2026-05-12T00:28:37.910Z');
    // No "Z", no fractional. Strict 2004 validators reject either.
    expect(formatISO8601Timestamp(d)).toBe('2026-05-12T00:28:37');
  });

  it('uses UTC components, not local TZ', () => {
    const d = new Date(Date.UTC(2026, 4, 12, 0, 28, 37));
    expect(formatISO8601Timestamp(d)).toBe('2026-05-12T00:28:37');
  });

  it('zero-pads single-digit fields', () => {
    const d = new Date(Date.UTC(2026, 0, 3, 4, 5, 6));
    expect(formatISO8601Timestamp(d)).toBe('2026-01-03T04:05:06');
  });
});

describe('formatReal107', () => {
  it('keeps clean decimals unchanged', () => {
    expect(formatReal107(0.85)).toBe('0.85');
    expect(formatReal107(85)).toBe('85');
    expect(formatReal107(0)).toBe('0');
    expect(formatReal107(1)).toBe('1');
  });

  it('truncates beyond 7 fractional digits', () => {
    expect(formatReal107(1 / 3)).toBe('0.3333333');
    expect(formatReal107(2 / 3)).toBe('0.6666667');
    expect(formatReal107((7 / 11) * 100)).toBe('63.6363636');
  });

  it('drops trailing zeros (no padded 0.8500000)', () => {
    expect(formatReal107(0.5)).toBe('0.5');
    expect(formatReal107(0.75)).toBe('0.75');
  });

  it('returns "0" for non-finite input', () => {
    expect(formatReal107(NaN)).toBe('0');
    expect(formatReal107(Infinity)).toBe('0');
  });
});

describe('formatHHMMSS', () => {
  it('formats 0 seconds', () => {
    expect(formatHHMMSS(0)).toBe('0000:00:00.00');
  });

  it('formats seconds only', () => {
    expect(formatHHMMSS(45)).toBe('0000:00:45.00');
  });

  it('formats minutes and seconds', () => {
    expect(formatHHMMSS(125)).toBe('0000:02:05.00');
  });

  it('formats hours, minutes, and seconds', () => {
    expect(formatHHMMSS(3661)).toBe('0001:01:01.00');
  });

  it('formats large hour values', () => {
    expect(formatHHMMSS(36000)).toBe('0010:00:00.00');
  });
});

describe('formatISO8601Duration', () => {
  it('formats 0 seconds', () => {
    expect(formatISO8601Duration(0)).toBe('PT0S');
  });

  it('formats seconds only', () => {
    expect(formatISO8601Duration(45)).toBe('PT45S');
  });

  it('formats minutes and seconds', () => {
    expect(formatISO8601Duration(125)).toBe('PT2M5S');
  });

  it('formats hours, minutes, and seconds', () => {
    expect(formatISO8601Duration(3661)).toBe('PT1H1M1S');
  });

  it('formats hours only (no trailing zeros)', () => {
    expect(formatISO8601Duration(7200)).toBe('PT2H');
  });

  it('formats minutes only', () => {
    expect(formatISO8601Duration(300)).toBe('PT5M');
  });
});

import { parseScaled01 } from '../src/runtime/adapters/format.js';

describe('parseScaled01', () => {
  it('accepts in-range numbers and numeric strings', () => {
    expect(parseScaled01(0)).toBe(0);
    expect(parseScaled01(1)).toBe(1);
    expect(parseScaled01(0.7)).toBe(0.7);
    expect(parseScaled01('0.5')).toBe(0.5);
  });
  it('rejects out-of-range, non-finite, empty, and null', () => {
    expect(parseScaled01(-0.1)).toBeNull();
    expect(parseScaled01(1.1)).toBeNull();
    expect(parseScaled01(NaN)).toBeNull();
    expect(parseScaled01(Infinity)).toBeNull();
    expect(parseScaled01('')).toBeNull();
    expect(parseScaled01(null)).toBeNull();
    expect(parseScaled01(undefined)).toBeNull();
    expect(parseScaled01('abc')).toBeNull();
  });
});
