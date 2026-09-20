import { describe, it, expect } from 'vitest';
import { ProgressState } from '../src/runtime/progress.svelte.js';
import { resolveSuccess } from '../src/runtime/types.js';
import { mergeCourseConfig } from '../src/plugin/index.js';
import { generateCMI5Xml } from '../src/plugin/export.js';
import { createManifest, createConfig } from './helpers.js';

describe('resolveSuccess', () => {
  it('implies a quiz verdict under quiz mode', () => {
    expect(resolveSuccess({ completion: { mode: 'quiz' } })).toEqual({
      from: 'quiz',
    });
  });

  it('implies a quiz verdict under percentage mode', () => {
    expect(resolveSuccess({ completion: { mode: 'percentage' } })).toEqual({
      from: 'quiz',
    });
  });

  it('implies no verdict under bare manual mode', () => {
    expect(resolveSuccess({ completion: { mode: 'manual' } })).toEqual({
      from: 'none',
    });
  });

  it('maps requireSuccessStatus onto a fixed verdict', () => {
    expect(
      resolveSuccess({
        completion: { mode: 'manual', requireSuccessStatus: 'failed' },
      }),
    ).toEqual({ from: 'fixed', status: 'failed' });
  });

  it('lets an explicit success block outrank requireSuccessStatus', () => {
    expect(
      resolveSuccess({
        completion: { mode: 'manual', requireSuccessStatus: 'passed' },
        success: { from: 'quiz' },
      }),
    ).toEqual({ from: 'quiz' });
  });

  it.each([
    { from: 'Quiz' },
    { from: 'vibes' },
    {},
    { from: 'fixed' },
    { from: 'fixed', status: 'maybe' },
  ])('resolves an unreadable criterion (%j) to no verdict', (success) => {
    expect(resolveSuccess({ success } as never)).toEqual({ from: 'none' });
  });
});

describe('an unreadable success criterion', () => {
  it('never reports a verdict, whatever the graded average', () => {
    const manifest = createManifest(3, { 1: { graded: true } });
    const progress = new ProgressState(
      manifest,
      createConfig({
        completion: { mode: 'percentage', percentageThreshold: 100 },
        success: { from: 'vibes' } as never,
        scoring: { passingScore: 70 },
      }),
    );

    progress.quizCompleted(1, 90);
    progress.markVisited(0);
    progress.markVisited(1);
    progress.markVisited(2);

    expect(progress.completionStatus).toBe('complete');
    expect(progress.successStatus).toBe('unknown');
  });

  it('satisfies the cmi5 AU on Completed alone', () => {
    const xml = generateCMI5Xml(
      {
        title: 'C',
        completion: { mode: 'manual' },
        success: { from: 'vibes' } as never,
        scoring: { passingScore: 70 },
        export: { standard: 'cmi5' },
      },
      true,
    );

    expect(xml).toContain('moveOn="Completed"');
  });
});

describe('a quiz criterion with nothing graded', () => {
  it('holds unknown for the whole attempt', () => {
    const progress = new ProgressState(
      createManifest(2),
      createConfig({
        completion: { mode: 'percentage', percentageThreshold: 100 },
        success: { from: 'quiz' },
      }),
    );

    progress.markVisited(0);
    progress.markVisited(1);

    expect(progress.completionStatus).toBe('complete');
    expect(progress.successStatus).toBe('unknown');
  });

  it('satisfies the cmi5 AU on Completed alone', () => {
    const xml = generateCMI5Xml(
      {
        title: 'C',
        completion: { mode: 'percentage', percentageThreshold: 100 },
        scoring: { passingScore: 70 },
        export: { standard: 'cmi5' },
      },
      false,
    );

    expect(xml).toContain('moveOn="Completed"');
  });
});

describe('success.from: "none"', () => {
  it('never sends a verdict even when the quiz average clears the bar', () => {
    const manifest = createManifest(5, { 2: { graded: true } });
    const config = createConfig({
      completion: { mode: 'percentage', percentageThreshold: 100 },
      success: { from: 'none' },
      scoring: { passingScore: 70 },
    });
    const progress = new ProgressState(manifest, config);

    progress.quizCompleted(2, 90);

    expect(progress.successStatus).toBe('unknown');
    expect(progress.gradedScore.average).toBe(90);
  });
});

describe('success.from: "quiz" under manual completion', () => {
  const build = () => {
    const manifest = createManifest(5, { 2: { graded: true } });
    const config = createConfig({
      completion: { mode: 'manual' },
      success: { from: 'quiz' },
      scoring: { passingScore: 70 },
    });
    return new ProgressState(manifest, config);
  };

  it('judges the score as soon as it is final, before the trigger', () => {
    const progress = build();

    progress.quizCompleted(2, 90);
    expect(progress.completionStatus).toBe('incomplete');
    expect(progress.successStatus).toBe('passed');

    progress.markCompleteManually();
    expect(progress.successStatus).toBe('passed');
  });

  it('reports failed for a learner who completes below the bar', () => {
    const progress = build();

    progress.quizCompleted(2, 40);
    progress.markCompleteManually();

    expect(progress.completionStatus).toBe('complete');
    expect(progress.successStatus).toBe('failed');
  });

  it('gives two learners different verdicts from the same trigger', () => {
    const pass = build();
    const fail = build();

    pass.quizCompleted(2, 80);
    fail.quizCompleted(2, 20);
    pass.markCompleteManually();
    fail.markCompleteManually();

    expect(pass.successStatus).toBe('passed');
    expect(fail.successStatus).toBe('failed');
  });

  it('reports no verdict for a learner who triggers completion without attempting', () => {
    const progress = build();

    progress.markCompleteManually();

    expect(progress.completionStatus).toBe('complete');
    expect(progress.gradedScore.attempted).toBe(false);
    expect(progress.successStatus).toBe('unknown');
  });

  it('declares no pass mark in the cmi5 manifest, but still needs a Passed', () => {
    const xml = generateCMI5Xml(
      {
        title: 'C',
        completion: { mode: 'manual' },
        success: { from: 'quiz' },
        scoring: { passingScore: 70 },
        export: { standard: 'cmi5' },
      },
      true,
    );

    expect(xml).not.toContain('masteryScore');
    expect(xml).toContain('moveOn="CompletedAndPassed"');
  });

  it('defaults passingScore to 70 rather than manual mode’s 0', () => {
    const merged = mergeCourseConfig({
      title: 'C',
      completion: { mode: 'manual' },
      success: { from: 'quiz' },
    });

    expect(merged.scoring.passingScore).toBe(70);
  });
});

describe('success.from: "fixed"', () => {
  it('asserts the status once a percentage course completes', () => {
    const manifest = createManifest(2);
    const config = createConfig({
      completion: { mode: 'percentage', percentageThreshold: 100 },
      success: { from: 'fixed', status: 'passed' },
    });
    const progress = new ProgressState(manifest, config);

    progress.markVisited(0);
    expect(progress.successStatus).toBe('unknown');

    progress.markVisited(1);
    expect(progress.completionStatus).toBe('complete');
    expect(progress.successStatus).toBe('passed');
  });

  it.each(['passed', 'failed'] as const)(
    'makes cmi5 satisfaction turn on an asserted %s',
    (status) => {
      const xml = generateCMI5Xml(
        {
          title: 'C',
          completion: { mode: 'manual' },
          success: { from: 'fixed', status },
          scoring: { passingScore: 70 },
          export: { standard: 'cmi5' },
        },
        false,
      );

      expect(xml).toContain('moveOn="CompletedAndPassed"');
    },
  );
});

describe('completion.mode presets still resolve as before', () => {
  it('keeps requireSuccessStatus working untouched', () => {
    const manifest = createManifest(2);
    const config = createConfig({
      completion: { mode: 'manual', requireSuccessStatus: 'passed' },
    });
    const progress = new ProgressState(manifest, config);

    expect(progress.successStatus).toBe('unknown');
    progress.markCompleteManually();
    expect(progress.successStatus).toBe('passed');
  });

  it('drops CompletedAndPassed when the quiz completes but does not judge', () => {
    const xml = generateCMI5Xml(
      {
        title: 'C',
        completion: { mode: 'quiz' },
        success: { from: 'none' },
        scoring: { passingScore: 80 },
        export: { standard: 'cmi5' },
      },
      true,
    );

    expect(xml).toContain('moveOn="Completed"');
    expect(xml).not.toContain('masteryScore');
  });
});
