import { describe, it, expect } from 'vitest';
import { isPageComplete } from '../src/runtime/navigation.svelte.js';
import { ProgressState } from '../src/runtime/progress.svelte.js';
import type { ManifestPage } from '../src/plugin/manifest.js';
import { createConfig, gradedQuizIndices } from './helpers.js';

function createPage(
  index: number,
  quiz: ManifestPage['quiz'] = null,
): ManifestPage {
  return {
    index,
    title: `Page ${index}`,
    slug: `page-${index}`,
    importPath: `/pages/page-${index}.svelte`,
    quiz,
  };
}

function createManifestFromPages(pages: ManifestPage[]) {
  return {
    sections: [
      {
        title: 'Section',
        slug: 'section',
        lessons: [{ title: 'Lesson', slug: 'lesson', pages }],
      },
    ],
    pages,
    totalPages: pages.length,
  };
}

describe('isPageComplete', () => {
  it('informational page is complete when visited', () => {
    const page = createPage(0);
    const manifest = createManifestFromPages([page]);
    const config = createConfig();
    const progress = new ProgressState(
      gradedQuizIndices(manifest),
      config,
      manifest.totalPages,
    );

    expect(isPageComplete(0, manifest, progress, config)).toBe(false);

    progress.markVisited(0);
    expect(isPageComplete(0, manifest, progress, config)).toBe(true);
  });

  it('non-gating quiz page is complete when answered', () => {
    const page = createPage(0, {
      graded: true,
      gatesProgress: false,
      maxAttempts: 3,
    });
    const manifest = createManifestFromPages([page]);
    const config = createConfig();
    const progress = new ProgressState(
      gradedQuizIndices(manifest),
      config,
      manifest.totalPages,
    );

    expect(isPageComplete(0, manifest, progress, config)).toBe(false);

    progress.quizCompleted(0, 30);
    expect(isPageComplete(0, manifest, progress, config)).toBe(true);
  });

  it('gating quiz page is complete only when passed', () => {
    const page = createPage(0, {
      graded: true,
      gatesProgress: true,
      maxAttempts: 3,
    });
    const manifest = createManifestFromPages([page]);
    const config = createConfig({ scoring: { passingScore: 70 } });
    const progress = new ProgressState(
      gradedQuizIndices(manifest),
      config,
      manifest.totalPages,
    );

    expect(isPageComplete(0, manifest, progress, config)).toBe(false);

    progress.quizCompleted(0, 50);
    expect(isPageComplete(0, manifest, progress, config)).toBe(false);

    progress.quizCompleted(0, 70);
    expect(isPageComplete(0, manifest, progress, config)).toBe(true);
  });

  it('gating quiz uses config passingScore', () => {
    const page = createPage(0, {
      graded: true,
      gatesProgress: true,
      maxAttempts: 3,
    });
    const manifest = createManifestFromPages([page]);
    const config = createConfig({ scoring: { passingScore: 90 } });
    const progress = new ProgressState(
      gradedQuizIndices(manifest),
      config,
      manifest.totalPages,
    );

    progress.quizCompleted(0, 85);
    expect(isPageComplete(0, manifest, progress, config)).toBe(false);

    progress.quizCompleted(0, 90);
    expect(isPageComplete(0, manifest, progress, config)).toBe(true);
  });
});
