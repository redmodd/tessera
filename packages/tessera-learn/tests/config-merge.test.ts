import { describe, it, expect } from 'vitest';
import { mergeCourseConfig } from '../src/plugin/index.js';

describe('mergeCourseConfig', () => {
  it('defaults title to "Untitled Course" when absent', () => {
    expect(mergeCourseConfig({}).title).toBe('Untitled Course');
  });

  it('defaults title to "Untitled Course" when empty — the validator promises this fallback', () => {
    expect(mergeCourseConfig({ title: '' }).title).toBe('Untitled Course');
  });

  it('keeps an author-supplied title', () => {
    expect(mergeCourseConfig({ title: 'My Course' }).title).toBe('My Course');
  });

  it.each([
    undefined,
    'english',
    'en_US',
    'en-x',
    'en-a',
    'en-US-US',
    'de-1',
    'zh-cmn-Hans',
    'en-GB-oed',
    'abcde',
    'und',
    'zxx-Latn',
    'mul',
  ])(
    'falls back to en for the missing or malformed language %s',
    (language) => {
      expect(mergeCourseConfig({ language }).language).toBe('en');
    },
  );

  it.each(['es-419', 'sr-Latn-RS', 'ca-ES-valencia', 'en-US-x-twain'])(
    'keeps the well-formed language %s',
    (language) => {
      expect(mergeCourseConfig({ language }).language).toBe(language);
    },
  );

  it.each([
    ['EN-gb', 'en-GB'],
    ['iw', 'he'],
  ])('canonicalizes the language %s to %s', (language, canonical) => {
    expect(mergeCourseConfig({ language }).language).toBe(canonical);
  });

  it('does not leak percentage defaults into quiz-mode completion', () => {
    const merged = mergeCourseConfig({ completion: { mode: 'quiz' } });
    expect(merged.completion).toEqual({ mode: 'quiz' });
    expect(merged.scoring.passingScore).toBe(70);
  });

  it('fills percentage completion defaults when completion is absent', () => {
    const merged = mergeCourseConfig({});
    expect(merged.completion).toEqual({
      mode: 'percentage',
      percentageThreshold: 100,
    });
    expect(merged.scoring.passingScore).toBe(70);
  });

  it('manual mode defaults passingScore to 0', () => {
    const merged = mergeCourseConfig({ completion: { mode: 'manual' } });
    expect(merged.completion).toEqual({ mode: 'manual' });
    expect(merged.scoring.passingScore).toBe(0);
  });

  it('keeps the 70 default under manual mode when a quiz judges success', () => {
    const merged = mergeCourseConfig({
      completion: { mode: 'manual' },
      success: { from: 'quiz' },
    });
    expect(merged.scoring.passingScore).toBe(70);
  });

  it('defaults a passingScore set to undefined', () => {
    const merged = mergeCourseConfig({
      scoring: { passingScore: undefined as unknown as number },
    });
    expect(merged.scoring.passingScore).toBe(70);
  });

  it('keeps an author-supplied passingScore of 0', () => {
    const merged = mergeCourseConfig({ scoring: { passingScore: 0 } });
    expect(merged.scoring.passingScore).toBe(0);
  });

  it('defaults resume to "auto" when absent', () => {
    expect(mergeCourseConfig({}).resume).toBe('auto');
  });

  it('keeps an author-supplied resume policy', () => {
    expect(mergeCourseConfig({ resume: 'never' }).resume).toBe('never');
  });
});
