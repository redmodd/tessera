import type { Manifest } from '../src/plugin/manifest.js';
import type { CourseConfig } from '../src/runtime/types.js';
import type { PersistenceAdapter } from '../src/runtime/persistence.js';

/** A connected adapter whose members all no-op, for mounting App without an LMS. */
export function stubAdapter(
  overrides: Partial<PersistenceAdapter> = {},
): PersistenceAdapter {
  return {
    connected: true,
    init: async () => {},
    loadState: async () => {},
    getState: () => null,
    saveState: () => {},
    getMasteryScore: () => null,
    setScore: () => {},
    setCompletionStatus: () => {},
    setSuccessStatus: () => {},
    seedLifecycle: () => false,
    deriveActor: () => null,
    launchPublisher: () => null,
    setDuration: () => {},
    setExit: () => {},
    reportInteraction: () => {},
    commit: () => {},
    terminate: () => {},
    ...overrides,
  };
}

export function createManifest(
  pageCount: number,
  quizPages: Record<number, { graded?: boolean; gatesProgress?: boolean }> = {},
  pageOpts: Record<number, { graded?: boolean; weight?: number }> = {},
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
    ...(pageOpts[i]?.graded ? { graded: true } : {}),
    ...(pageOpts[i]?.weight !== undefined
      ? { weight: pageOpts[i].weight }
      : {}),
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

export function createConfig(
  overrides: Partial<CourseConfig> = {},
): CourseConfig {
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
