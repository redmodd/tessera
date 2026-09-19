import type { Manifest } from '../src/plugin/manifest.js';
import type { CourseConfig } from '../src/runtime/types.js';
import type {
  PersistenceAdapter,
  SavedState,
} from '../src/runtime/persistence.js';
import { BaseAdapter } from '../src/runtime/adapters/base.js';
import type { SCORM12API } from '../src/runtime/adapters/scorm12.js';
import type { SCORM2004API } from '../src/runtime/adapters/scorm2004.js';

/** A SCORM 1.2 API whose GetValue reads from `values` and whose calls all succeed. */
export function scorm12Api(values: Record<string, string> = {}): SCORM12API {
  return {
    LMSInitialize: () => 'true',
    LMSFinish: () => 'true',
    LMSGetValue: (k) => values[k] ?? '',
    LMSSetValue: () => 'true',
    LMSCommit: () => 'true',
    LMSGetLastError: () => '0',
    LMSGetErrorString: () => '',
    LMSGetDiagnostic: () => '',
  };
}

/** A SCORM 2004 API whose GetValue reads from `values` and whose calls all succeed. */
export function scorm2004Api(
  values: Record<string, string> = {},
): SCORM2004API {
  return {
    Initialize: () => 'true',
    Terminate: () => 'true',
    GetValue: (k) => values[k] ?? '',
    SetValue: () => 'true',
    Commit: () => 'true',
    GetLastError: () => '0',
    GetErrorString: () => '',
    GetDiagnostic: () => '',
  };
}

class StubAdapter extends BaseAdapter {
  async init(): Promise<void> {}
  getState(): SavedState | null {
    return null;
  }
  saveState(): void {}
}

/** A connected adapter whose members all no-op, for mounting App without an LMS. */
export function stubAdapter(
  overrides: Partial<PersistenceAdapter> = {},
): PersistenceAdapter {
  return Object.assign(new StubAdapter(), overrides);
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
