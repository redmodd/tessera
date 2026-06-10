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
});
