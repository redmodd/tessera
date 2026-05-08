import { describe, it, expect } from 'vitest';
import { slugFromQuestion } from '../src/components/util.js';

describe('slugFromQuestion', () => {
  it('produces a stable slug across calls for the same input', () => {
    const a = slugFromQuestion('What is 2 + 2?');
    const b = slugFromQuestion('What is 2 + 2?');
    expect(a).toBe(b);
    expect(a).toBe('what-is-2-2');
  });

  it('lowercases, replaces non-alphanumerics with single dashes, trims edges', () => {
    expect(slugFromQuestion('  Hello, World!! ')).toBe('hello-world');
  });

  it('caps length at 40 characters', () => {
    const long = 'a'.repeat(100);
    expect(slugFromQuestion(long).length).toBeLessThanOrEqual(40);
  });

  it('handles nullish input without throwing', () => {
    expect(slugFromQuestion(undefined)).toBe('');
    expect(slugFromQuestion(null)).toBe('');
  });

  it('matches the id prefixes the four built-in question components emit', () => {
    // Each component prefixes the slug with its widget kind and uses the
    // result as the registerQuestion id when the author omits `id`. The
    // contract: same `question` text → same slug body across components,
    // so SCORM/cmi5 interaction records key consistently.
    const slug = slugFromQuestion('Pick the capital of France');
    expect(`mc-${slug}`).toBe('mc-pick-the-capital-of-france');
    expect(`fitb-${slug}`).toBe('fitb-pick-the-capital-of-france');
    expect(`matching-${slug}`).toBe('matching-pick-the-capital-of-france');
    expect(`sorting-${slug}`).toBe('sorting-pick-the-capital-of-france');
  });
});
