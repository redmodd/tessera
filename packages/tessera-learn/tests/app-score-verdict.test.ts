// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { XAPIAdapter } from '../src/runtime/adapters/xapi.js';
import type { BaseAdapter } from '../src/runtime/adapters/base.js';
import { createManifest, flush, stubAdapter } from './helpers.js';

const ACTOR = {
  objectType: 'Agent',
  account: { homePage: 'https://lms', name: 'learner-1' },
};

const manifest = createManifest(1, { 0: { graded: true } });

const config = {
  title: 'Demo',
  resume: 'auto',
  branding: {},
  navigation: { mode: 'free' },
  scoring: { passingScore: 70 },
  completion: { mode: 'quiz' },
  export: { standard: 'xapi' },
};

async function mountApp(
  adapter: BaseAdapter,
  course = manifest,
  loadLayout = () => import('./fixtures/mastery-layout.svelte'),
  loadPage: () => Promise<unknown> = () => new Promise(() => {}),
) {
  vi.resetModules();
  const { mount, unmount } = await import('svelte');
  (globalThis as any).__tesseraTest = {
    config,
    manifest: course,
    pageModules: Object.fromEntries(
      course.pages.map((p) => [p.importPath, loadPage]),
    ),
    adapter,
    layout: (await loadLayout()).default,
  };
  const App = (await import('../src/runtime/App.svelte')).default;
  const component = mount(App, { target: document.body });

  await vi.waitFor(() =>
    expect((globalThis as any).__tesseraNavCtx).toBeTruthy(),
  );
  const { progress } = (globalThis as any).__tesseraNavCtx;
  return { cleanup: () => unmount(component), progress };
}

async function mountLaunched() {
  const verbs: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: unknown, init?: { method?: string; body?: string }) => {
      if (String(url).includes('/statements') && init?.method === 'POST') {
        const body = JSON.parse(init.body!);
        for (const statement of Array.isArray(body) ? body : [body]) {
          verbs.push(statement.verb.display['en-US']);
        }
        return new Response('[]', { status: 200 });
      }
      return new Response('{}', { status: 404 });
    }),
  );

  const params = new URLSearchParams({
    endpoint: 'https://lrs.example/xapi',
    auth: 'Basic Zm9vOmJhcg==',
    actor: JSON.stringify(ACTOR),
    activity_id: 'urn:tessera:au:abc',
    registration: '2d8b1e1e-0000-4000-8000-000000000000',
  });
  window.history.replaceState({}, '', `/?${params}`);

  return { ...(await mountApp(new XAPIAdapter())), verbs };
}

describe('a graded submit that decides the verdict', () => {
  let cleanup: (() => void) | null = null;

  afterEach(() => {
    cleanup?.();
    cleanup = null;
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
    delete (globalThis as any).__tesseraTest;
    delete (globalThis as any).__tesseraNavCtx;
    delete (globalThis as any).__showLateCheck;
    window.history.replaceState({}, '', '/');
  });

  it('reports the score on the verdict instead of a statement of its own', async () => {
    const mounted = await mountLaunched();
    cleanup = mounted.cleanup;
    await vi.waitFor(() => expect(mounted.verbs).toContain('initialized'));
    mounted.verbs.length = 0;

    mounted.progress.quizCompleted(0, 90);

    await vi.waitFor(() => expect(mounted.verbs).toContain('passed'));
    await flush();

    expect(mounted.verbs).not.toContain('scored');
  });

  it('sends the verdict once, not again from the success effect', async () => {
    const setSuccessStatus = vi.fn();
    const mounted = await mountApp(stubAdapter({ setSuccessStatus }));
    cleanup = mounted.cleanup;
    await flush();

    mounted.progress.quizCompleted(0, 90);
    await flush();

    expect(setSuccessStatus.mock.calls.map(([status]) => status)).toEqual([
      'unknown',
      'passed',
    ]);
  });

  it('records a graded question in the layout against no page', async () => {
    const mounted = await mountApp(
      stubAdapter(),
      createManifest(1, {}, { 0: { graded: true } }),
      () => import('./fixtures/question-layout.svelte'),
      () => import('./fixtures/app-page.svelte'),
    );
    cleanup = mounted.cleanup;
    await vi.waitFor(() =>
      expect(document.body.textContent).toContain('Test page'),
    );

    (globalThis as any).__showLateCheck();
    await flush();

    expect(mounted.progress.gradedUnits.size).toBe(0);
    expect(mounted.progress.successStatus).toBe('unknown');
  });

  it('holds the completion a later optional page would take back', async () => {
    const setCompletionStatus = vi.fn();
    const setExit = vi.fn();
    const saveState = vi.fn();
    const mounted = await mountApp(
      stubAdapter({ setCompletionStatus, setExit, saveState }),
      createManifest(
        2,
        { 0: { graded: true }, 1: { graded: true } },
        { 1: { required: false } },
      ),
    );
    cleanup = mounted.cleanup;
    await flush();

    mounted.progress.quizCompleted(0, 90);
    await flush();

    mounted.progress.quizCompleted(1, 0);
    await flush();

    expect(mounted.progress.completionStatus).toBe('incomplete');
    expect(setCompletionStatus.mock.calls.map(([status]) => status)).toEqual([
      'incomplete',
      'complete',
    ]);

    window.dispatchEvent(new Event('pagehide'));

    expect(setExit).toHaveBeenCalledWith('normal');
    expect(saveState.mock.calls.at(-1)![0]).toMatchObject({ k: 1 });
  });
});
