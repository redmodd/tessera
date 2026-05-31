import { describe, it, expect } from 'vitest';
import {
  freeAccess,
  sequentialAccess,
  resolveAccess,
  type AccessFn,
} from '../src/runtime/access.js';
import { ProgressState } from '../src/runtime/progress.svelte.js';
import { createManifest, createConfig, gradedQuizIndices } from './helpers.js';

function ctx(
  pageIndex: number,
  manifest: ReturnType<typeof createManifest>,
  progress: ProgressState,
  config: ReturnType<typeof createConfig>,
) {
  return {
    pageIndex,
    page: manifest.pages[pageIndex],
    manifest,
    progress,
    config,
  };
}

describe('freeAccess', () => {
  it('allows any page when no preceding gating quiz exists', () => {
    const manifest = createManifest(5);
    const progress = new ProgressState(
      gradedQuizIndices(manifest),
      createConfig(),
      manifest.totalPages,
    );
    const config = createConfig();
    expect(freeAccess(ctx(4, manifest, progress, config))).toBe(true);
  });

  it('locks a page behind a failing gating quiz', () => {
    const manifest = createManifest(5, {
      2: { graded: true, gatesProgress: true },
    });
    const progress = new ProgressState(
      gradedQuizIndices(manifest),
      createConfig(),
      manifest.totalPages,
    );
    const config = createConfig({ scoring: { passingScore: 70 } });
    expect(freeAccess(ctx(4, manifest, progress, config))).toBe(false);
  });

  it('unlocks pages once the gating quiz is passed', () => {
    const manifest = createManifest(5, {
      2: { graded: true, gatesProgress: true },
    });
    const progress = new ProgressState(
      gradedQuizIndices(manifest),
      createConfig(),
      manifest.totalPages,
    );
    progress.quizCompleted(2, 80);
    const config = createConfig({ scoring: { passingScore: 70 } });
    expect(freeAccess(ctx(4, manifest, progress, config))).toBe(true);
  });

  it('only honors the nearest preceding gating quiz', () => {
    const manifest = createManifest(6, {
      1: { graded: true, gatesProgress: true },
      3: { graded: true, gatesProgress: true },
    });
    const progress = new ProgressState(
      gradedQuizIndices(manifest),
      createConfig(),
      manifest.totalPages,
    );
    progress.quizCompleted(3, 90);
    // Page 1 quiz is unattempted but irrelevant — page 3's gate is the nearest.
    const config = createConfig({ scoring: { passingScore: 70 } });
    expect(freeAccess(ctx(5, manifest, progress, config))).toBe(true);
  });

  it('treats non-gating quizzes as transparent', () => {
    const manifest = createManifest(5, {
      2: { graded: true, gatesProgress: false },
    });
    const progress = new ProgressState(
      gradedQuizIndices(manifest),
      createConfig(),
      manifest.totalPages,
    );
    const config = createConfig({ scoring: { passingScore: 70 } });
    expect(freeAccess(ctx(4, manifest, progress, config))).toBe(true);
  });
});

describe('sequentialAccess', () => {
  it('allows page 0 unconditionally', () => {
    const manifest = createManifest(5);
    const progress = new ProgressState(
      gradedQuizIndices(manifest),
      createConfig(),
      manifest.totalPages,
    );
    const config = createConfig();
    expect(sequentialAccess(ctx(0, manifest, progress, config))).toBe(true);
  });

  it('locks any page beyond an unvisited preceding page', () => {
    const manifest = createManifest(5);
    const progress = new ProgressState(
      gradedQuizIndices(manifest),
      createConfig(),
      manifest.totalPages,
    );
    const config = createConfig();
    expect(sequentialAccess(ctx(2, manifest, progress, config))).toBe(false);
  });

  it('unlocks the next page once the preceding page is visited', () => {
    const manifest = createManifest(5);
    const progress = new ProgressState(
      gradedQuizIndices(manifest),
      createConfig(),
      manifest.totalPages,
    );
    progress.markVisited(0);
    const config = createConfig();
    expect(sequentialAccess(ctx(1, manifest, progress, config))).toBe(true);
    expect(sequentialAccess(ctx(2, manifest, progress, config))).toBe(false);
  });

  it('requires preceding quizzes to be scored before unlocking later pages', () => {
    const manifest = createManifest(4, { 1: { graded: true } });
    const progress = new ProgressState(
      gradedQuizIndices(manifest),
      createConfig(),
      manifest.totalPages,
    );
    progress.markVisited(0);
    const config = createConfig({ scoring: { passingScore: 70 } });

    expect(sequentialAccess(ctx(2, manifest, progress, config))).toBe(false);
    progress.quizCompleted(1, 50);
    expect(sequentialAccess(ctx(2, manifest, progress, config))).toBe(true);
  });
});

describe('resolveAccess', () => {
  it('returns freeAccess by default', () => {
    expect(resolveAccess(createConfig({ navigation: { mode: 'free' } }))).toBe(
      freeAccess,
    );
  });

  it('returns sequentialAccess for sequential mode', () => {
    expect(
      resolveAccess(createConfig({ navigation: { mode: 'sequential' } })),
    ).toBe(sequentialAccess);
  });

  it('honors a custom canAccess over the preset', () => {
    const custom: AccessFn = () => false;
    const config = createConfig({
      navigation: { mode: 'free', canAccess: custom },
    });
    expect(resolveAccess(config)).toBe(custom);
  });

  it('composes naturally with presets', () => {
    const manifest = createManifest(3);
    const progress = new ProgressState(
      gradedQuizIndices(manifest),
      createConfig(),
      manifest.totalPages,
    );
    const config = createConfig({ navigation: { mode: 'sequential' } });

    const custom: AccessFn = (c) =>
      sequentialAccess(c) && c.progress.visitedPages.has(0);

    expect(custom(ctx(1, manifest, progress, config))).toBe(false);
    progress.markVisited(0);
    expect(custom(ctx(1, manifest, progress, config))).toBe(true);
  });
});
