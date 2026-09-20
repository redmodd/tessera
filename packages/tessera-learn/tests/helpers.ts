import { vi, type Mocked } from 'vitest';
import type { Manifest } from '../src/plugin/manifest.js';
import type { CourseConfig } from '../src/runtime/types.js';
import { BaseAdapter } from '../src/runtime/adapters/base.js';
import type { SCORM12API } from '../src/runtime/adapters/scorm12.js';
import type { SCORM2004API } from '../src/runtime/adapters/scorm2004.js';

/** A SCORM 1.2 API backed by a store seeded from `values`; every call is a spy that succeeds. */
export function scorm12Api(
  values: Record<string, string> = {},
): Mocked<SCORM12API> {
  const store = new Map(Object.entries(values));
  return {
    LMSInitialize: vi.fn().mockReturnValue('true'),
    LMSFinish: vi.fn().mockReturnValue('true'),
    LMSGetValue: vi.fn((key: string) => store.get(key) ?? ''),
    LMSSetValue: vi.fn((key: string, value: string) => {
      store.set(key, value);
      return 'true';
    }),
    LMSCommit: vi.fn().mockReturnValue('true'),
    LMSGetLastError: vi.fn().mockReturnValue('0'),
    LMSGetErrorString: vi.fn().mockReturnValue(''),
    LMSGetDiagnostic: vi.fn().mockReturnValue(''),
  };
}

/** A SCORM 2004 API backed by a store seeded from `values`; every call is a spy that succeeds. */
export function scorm2004Api(
  values: Record<string, string> = {},
): Mocked<SCORM2004API> {
  const store = new Map(Object.entries(values));
  return {
    Initialize: vi.fn().mockReturnValue('true'),
    Terminate: vi.fn().mockReturnValue('true'),
    GetValue: vi.fn((key: string) => store.get(key) ?? ''),
    SetValue: vi.fn((key: string, value: string) => {
      store.set(key, value);
      return 'true';
    }),
    Commit: vi.fn().mockReturnValue('true'),
    GetLastError: vi.fn().mockReturnValue('0'),
    GetErrorString: vi.fn().mockReturnValue(''),
    GetDiagnostic: vi.fn().mockReturnValue(''),
  };
}

class StubAdapter extends BaseAdapter {
  async init(): Promise<void> {}
  saveState(): void {}
}

/**
 * A connected adapter whose members all no-op, for mounting App without an
 * LMS. An override left undefined keeps the default member.
 */
export function stubAdapter(overrides: Partial<BaseAdapter> = {}): BaseAdapter {
  const defined = Object.entries(overrides).filter(([, v]) => v !== undefined);
  return Object.assign(new StubAdapter(), Object.fromEntries(defined));
}

/** Let an adapter's async write queue drain. */
export const flush = () => new Promise<void>((r) => setTimeout(r, 50));

export function createManifest(
  pageCount: number,
  quizPages: Record<
    number,
    { graded?: boolean; required?: boolean; gatesProgress?: boolean }
  > = {},
  pageOpts: Record<
    number,
    { graded?: boolean; required?: boolean; weight?: number }
  > = {},
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
          ...(quizPages[i].required === false ? { required: false } : {}),
        }
      : null,
    ...(pageOpts[i]?.graded ? { graded: true } : {}),
    ...(pageOpts[i]?.required === false ? { required: false } : {}),
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
