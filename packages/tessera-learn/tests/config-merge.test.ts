import { describe, it, expect } from 'vitest';
import { mergeCourseConfig } from '../src/plugin/index.js';
import type { CourseConfig } from '../src/runtime/types.js';

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

  it('keeps the 70 default under manual mode when a quiz judges success', () => {
    const merged = mergeCourseConfig({
      completion: { mode: 'manual' },
      success: { from: 'quiz' },
    });
    expect(merged.scoring.passingScore).toBe(70);
  });

  it('defaults resume to "auto" when absent', () => {
    expect(mergeCourseConfig({}).resume).toBe('auto');
  });

  it('keeps an author-supplied resume policy', () => {
    expect(mergeCourseConfig({ resume: 'never' }).resume).toBe('never');
  });

  it('replaces a non-object section with its defaults', () => {
    const merged = mergeCourseConfig({
      navigation: 'sequential',
      completion: 'manual',
      scoring: 70,
      export: 'scorm12',
    } as unknown as Partial<CourseConfig>);
    expect(merged.navigation).toEqual({ mode: 'free' });
    expect(merged.completion).toEqual(mergeCourseConfig({}).completion);
    expect(merged.scoring).toEqual({ passingScore: 70 });
    expect(merged.export).toEqual({ standard: 'web' });
  });
});
