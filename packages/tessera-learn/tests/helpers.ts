import type { Manifest } from '../src/plugin/manifest.js';
import type { CourseConfig } from '../src/runtime/types.js';

export function createManifest(
  pageCount: number,
  quizPages: Record<number, { graded?: boolean; gatesProgress?: boolean }> = {}
): Manifest {
  const pages = Array.from({ length: pageCount }, (_, i) => ({
    index: i,
    title: `Page ${i}`,
    slug: `page-${i}`,
    importPath: `/pages/page-${i}.svelte`,
    quiz: quizPages[i]
      ? {
          graded: quizPages[i].graded ?? false,
          gatesProgress: quizPages[i].gatesProgress ?? false,
          maxAttempts: 3,
        }
      : null,
  }));

  return {
    sections: [
      {
        title: 'Section',
        slug: 'section',
        lessons: [{ title: 'Lesson', slug: 'lesson', pages }],
      },
    ],
    pages,
    totalPages: pageCount,
  };
}

export function createConfig(overrides: Partial<CourseConfig> = {}): CourseConfig {
  return {
    title: 'Test',
    description: '',
    author: '',
    version: '1.0.0',
    branding: { logo: '', primaryColor: '#2563eb', fontFamily: 'Inter' },
    navigation: { mode: 'free' as const },
    completion: { mode: 'percentage' as const, percentageThreshold: 100 },
    scoring: { passingScore: 70 },
    export: { standard: 'web' as const },
    ...overrides,
  };
}
