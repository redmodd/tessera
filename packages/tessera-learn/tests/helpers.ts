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
import type { NavContext } from '../src/runtime/contexts.js';
import type { XAPIClient } from '../src/runtime/xapi/client.js';
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

/** Stubs `window` as a course iframe whose top-level LMS frame holds `lmsGlobals`. */
export function stubLmsFrame(lmsGlobals: Record<string, unknown> = {}): void {
  const lms: Record<string, unknown> = { ...lmsGlobals };
  lms.parent = lms;
  vi.stubGlobal('window', { parent: lms });
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
export const flush = () => new Promise<void>((r) => setTimeout(r));

export const noDeadline = new Promise<never>(() => {});

export function useFakeTimers(
  options?: Parameters<typeof vi.useFakeTimers>[0],
): void {
  vi.useFakeTimers(options);
  onTestFinished(() => {
    vi.useRealTimers();
  });
}

export function setLaunchParams(params: Record<string, string> = {}): void {
  const { history } = window;
  history.replaceState({}, '', `/?${new URLSearchParams(params)}`);
  onTestFinished(() => history.replaceState({}, '', '/'));
}

export const respond = (status: number, body: BodyInit | null = null) =>
  new Response(body, { status });

export const CMI5_LAUNCH = {
  fetch: 'https://lms.example.com/fetch-token',
  endpoint: 'https://lms.example.com/xapi/',
  registration: 'reg-123',
  activityId: 'https://example.com/course/1',
  actor: JSON.stringify({ mbox: 'mailto:test@example.com', name: 'Test User' }),
};

export function cmi5Fetch({
  token = 'test-auth-token',
  launchData,
  saved,
}: { token?: string; launchData?: object; saved?: object } = {}) {
  return async (url: string, init?: RequestInit): Promise<Response> => {
    if (url === CMI5_LAUNCH.fetch) return new Response(token);
    if (init?.method && init.method !== 'GET') return respond(204);
    const stateId = new URL(url).searchParams.get('stateId');
    const doc =
      stateId === 'LMS.LaunchData'
        ? launchData
        : stateId === 'tessera-state'
          ? saved
          : undefined;
    return doc ? Response.json(doc) : respond(404);
  };
}

export function setXAPILaunch(params: Record<string, string> = {}): void {
  setLaunchParams({
    endpoint: 'https://lrs.example/xapi',
    auth: 'Basic Zm9vOmJhcg==',
    actor: JSON.stringify({
      objectType: 'Agent',
      account: { homePage: 'https://lms', name: 'learner-1' },
    }),
    activity_id: 'urn:tessera:au:abc',
    ...params,
  });
}

export function valuesUnder(
  writes: string[][],
  prefix: string,
): Record<string, string> {
  return Object.fromEntries(
    writes
      .filter(([key]) => key.startsWith(`${prefix}.`))
      .map(([key, value]) => [key.slice(prefix.length + 1), value]),
  );
}

export function requests(fetch: Mock, path: string, method?: string) {
  return fetch.mock.calls.filter(
    ([url, init]) =>
      String(url).includes(path) && (!method || init?.method === method),
  );
}

export const statementRequests = (fetch: Mock) =>
  requests(fetch, '/statements', 'POST');

export function postedStatements(fetch: Mock): any[] {
  return statementRequests(fetch).flatMap(([, init]) => JSON.parse(init.body));
}

export function printed(spy: MockInstance): string {
  return spy.mock.calls.flat().join('\n');
}

export function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'tessera-test-'));
  onTestFinished(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

export function makeWorkspace(courses: string[] = []): string {
  const root = tempDir();
  mkdirSync(join(root, 'courses'));
  for (const name of courses) {
    const dir = join(root, 'courses', name);
    mkdirSync(join(dir, 'pages'), { recursive: true });
    writeFileSync(join(dir, 'course.config.js'), 'export default {};');
  }
  return root;
}

export async function mountApp({
  config,
  manifest,
  adapter,
  loadPage = () => import('./fixtures/app-page.svelte'),
  loadLayout,
  xapiClient,
}: {
  config: CourseConfig;
  manifest: Manifest;
  adapter: BaseAdapter;
  loadPage?: () => Promise<unknown>;
  loadLayout?: (() => Promise<{ default: unknown }>) | null;
  xapiClient?: Pick<XAPIClient, 'markUnloading' | 'markRestored' | 'flush'>;
}) {
  // App.svelte imports config at module scope, so the stubs need re-evaluating
  // for each mount. Svelte and the layout come from that same fresh registry or
  // every $effect is orphaned against a second runtime instance.
  vi.resetModules();
  const { mount, unmount } = await import('svelte');
  vi.stubGlobal('__tesseraTest', {
    config,
    manifest,
    adapter,
    pageModules: Object.fromEntries(
      manifest.pages.map((p) => [p.importPath, loadPage]),
    ),
    layout: loadLayout && (await loadLayout()).default,
    xapiClient,
  });
  vi.stubGlobal('__tesseraNavCtx', undefined);
  const App = (await import('../src/runtime/App.svelte')).default;
  const component = mount(App, { target: document.body });
  onTestFinished(() => {
    try {
      unmount(component);
    } finally {
      document.body.innerHTML = '';
    }
  });
}

export const navCtx = (): NavContext => (globalThis as any).__tesseraNavCtx;

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

export function manualConfig(
  overrides: Partial<CourseConfig['completion']> = {},
): CourseConfig {
  return createConfig({
    completion: { mode: 'manual', ...overrides } as CourseConfig['completion'],
    scoring: { passingScore: 0 },
  });
}
