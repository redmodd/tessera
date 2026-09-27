import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  onTestFinished,
  vi,
  type Mock,
  type MockInstance,
  type Mocked,
} from 'vitest';
import type { Manifest, ManifestPage } from '../src/plugin/manifest.js';
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

/** A connected adapter whose members all no-op, for mounting App without an LMS. */
export function stubAdapter(overrides: Partial<BaseAdapter> = {}): BaseAdapter {
  return Object.assign(new StubAdapter(), overrides);
}

/** Let an adapter's async write queue drain. */
export const flush = () => new Promise<void>((r) => setTimeout(r, 50));

export const tick = () => new Promise<void>((r) => setTimeout(r, 0));

export function useFakeTimers(): void {
  vi.useFakeTimers();
  onTestFinished(() => vi.useRealTimers());
}

export function setLaunchParams(params: Record<string, string> = {}): void {
  const { history } = window;
  history.replaceState({}, '', `/?${new URLSearchParams(params)}`);
  onTestFinished(() => history.replaceState({}, '', '/'));
}

export function setValuesFor(
  setValue: Mock<(key: string, value: string) => string>,
  prefix: string,
): Record<string, string> {
  return Object.fromEntries(
    setValue.mock.calls.filter(([key]) => key.startsWith(prefix)),
  );
}

export function statementRequests(fetch: Mock) {
  return fetch.mock.calls.filter(
    ([url, init]) =>
      String(url).includes('/statements') && init?.method === 'POST',
  );
}

export function postedStatements(fetch: Mock): any[] {
  return statementRequests(fetch).flatMap(([, init]) => JSON.parse(init.body));
}

export function printed(spy: MockInstance): string {
  return spy.mock.calls.flat().join('\n');
}

export function makeWorkspace(courses: string[] = []): string {
  const root = mkdtempSync(join(tmpdir(), 'tessera-test-'));
  mkdirSync(join(root, 'courses'));
  for (const name of courses) {
    const dir = join(root, 'courses', name);
    mkdirSync(join(dir, 'pages'), { recursive: true });
    writeFileSync(join(dir, 'course.config.js'), 'export default {};');
  }
  onTestFinished(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

export async function mountApp({
  loadLayout,
  ...testGlobals
}: {
  config: unknown;
  manifest: unknown;
  pageModules: Record<string, () => Promise<unknown>>;
  adapter: BaseAdapter;
  loadLayout?: () => Promise<{ default: unknown }>;
}) {
  // App.svelte imports config at module scope, so the stubs need re-evaluating
  // for each mount. Svelte and the layout come from that same fresh registry or
  // every $effect is orphaned against a second runtime instance.
  vi.resetModules();
  const { mount, unmount } = await import('svelte');
  vi.stubGlobal('__tesseraTest', {
    ...testGlobals,
    layout: loadLayout && (await loadLayout()).default,
  });
  vi.stubGlobal('__tesseraNavCtx', undefined);
  const App = (await import('../src/runtime/App.svelte')).default;
  const component = mount(App, { target: document.body });
  onTestFinished(() => {
    unmount(component);
    document.body.innerHTML = '';
  });
}

export function createManifest(
  pageCount: number,
  quizPages: Record<number, { graded?: boolean; gatesProgress?: boolean }> = {},
  pageOpts: Record<
    number,
    Partial<
      Pick<
        ManifestPage,
        'graded' | 'required' | 'weight' | 'questions' | 'completesOn'
      >
    >
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
        }
      : null,
    ...pageOpts[i],
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
