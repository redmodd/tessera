import { describe, it, expect } from 'vitest';
import { axeTags, axeIgnoreRules } from '../src/plugin/a11y/audit.js';

describe('axeTags', () => {
  it('maps each standard to its cumulative tag list', () => {
    expect(axeTags('wcag2a')).toEqual(['wcag2a']);
    expect(axeTags('wcag2aa')).toEqual(['wcag2a', 'wcag2aa']);
    expect(axeTags('wcag21aa')).toEqual([
      'wcag2a',
      'wcag2aa',
      'wcag21a',
      'wcag21aa',
    ]);
  });
});

describe('axeIgnoreRules', () => {
  it('keeps only bare axe rule IDs, dropping tessera/ and a11y_ namespaces', () => {
    const ignore = [
      'tessera/image-alt',
      'a11y_missing_attribute',
      'image-alt',
      'color-contrast',
    ];
    expect(axeIgnoreRules(ignore)).toEqual(['image-alt', 'color-contrast']);
  });
});
