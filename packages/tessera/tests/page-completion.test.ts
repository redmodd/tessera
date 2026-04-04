import { describe, it, expect } from 'vitest';
import { isPageComplete } from '../src/runtime/navigation.svelte.js';
import { ProgressState } from '../src/runtime/progress.svelte.js';
import type { Manifest, ManifestPage } from '../src/plugin/manifest.js';
import type { CourseConfig } from '../src/runtime/types.js';

function createPage(index: number, quiz: ManifestPage['quiz'] = null): ManifestPage {
  return {
    index,
    title: `Page ${index}`,
    slug: `page-${index}`,
    importPath: `/pages/page-${index}.svelte`,
    quiz,
  };
}

function createManifest(pages: ManifestPage[]): Manifest {
  return {
    sections: [{
      title: 'Section',
      slug: 'section',
      lessons: [{ title: 'Lesson', slug: 'lesson', pages }],
    }],
    pages,
    totalPages: pages.length,
  };
}

function createConfig(passingScore = 70): CourseConfig {
  return {
    title: 'Test',
    description: '',
    author: '',
    version: '1.0.0',
    branding: { logo: '', primaryColor: '#2563eb', fontFamily: 'Inter' },
    navigation: { mode: 'free' },
    completion: { mode: 'percentage', percentageThreshold: 100 },
    scoring: { passingScore },
    export: { standard: 'web' },
  };
}

describe('isPageComplete', () => {
  it('informational page is complete when visited', () => {
    const page = createPage(0);
    const manifest = createManifest([page]);
    const progress = new ProgressState();
    const config = createConfig();

    expect(isPageComplete(0, manifest, progress, config)).toBe(false);

    progress.markVisited(0);
    expect(isPageComplete(0, manifest, progress, config)).toBe(true);
  });

  it('non-gating quiz page is complete when answered', () => {
    const page = createPage(0, { graded: true, gatesProgress: false, maxAttempts: 3, showFeedback: true });
    const manifest = createManifest([page]);
    const progress = new ProgressState();
    const config = createConfig();

    expect(isPageComplete(0, manifest, progress, config)).toBe(false);

    progress.quizCompleted(0, 30); // any score counts
    expect(isPageComplete(0, manifest, progress, config)).toBe(true);
  });

  it('gating quiz page is complete only when passed', () => {
    const page = createPage(0, { graded: true, gatesProgress: true, maxAttempts: 3, showFeedback: true });
    const manifest = createManifest([page]);
    const progress = new ProgressState();
    const config = createConfig(70);

    expect(isPageComplete(0, manifest, progress, config)).toBe(false);

    progress.quizCompleted(0, 50); // below passing
    expect(isPageComplete(0, manifest, progress, config)).toBe(false);

    progress.quizCompleted(0, 70); // at passing
    expect(isPageComplete(0, manifest, progress, config)).toBe(true);
  });

  it('gating quiz uses config passingScore', () => {
    const page = createPage(0, { graded: true, gatesProgress: true, maxAttempts: 3, showFeedback: true });
    const manifest = createManifest([page]);
    const progress = new ProgressState();
    const config = createConfig(90);

    progress.quizCompleted(0, 85);
    expect(isPageComplete(0, manifest, progress, config)).toBe(false);

    progress.quizCompleted(0, 90);
    expect(isPageComplete(0, manifest, progress, config)).toBe(true);
  });
});
