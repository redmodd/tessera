// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { XAPIAdapter } from '../src/runtime/adapters/xapi.js';
import type { BaseAdapter } from '../src/runtime/adapters/base.js';
import {
  createConfig,
  createManifest,
  flush,
  mountApp,
  navCtx,
  postedStatements,
  respond,
  setXAPILaunch,
  stubAdapter,
} from './helpers.js';

const manifest = createManifest(1, { 0: { graded: true } });

const config = createConfig({
  resume: 'auto',
  completion: { mode: 'quiz' },
  export: { standard: 'xapi' },
});

async function mount(
  adapter: BaseAdapter,
  {
    course = manifest,
    loadLayout = () => import('./fixtures/mastery-layout.svelte'),
    loadPage = () => new Promise(() => {}),
  }: {
    course?: typeof manifest;
    loadLayout?: () => Promise<{ default: unknown }>;
    loadPage?: () => Promise<unknown>;
  } = {},
) {
  await mountApp({ config, manifest: course, adapter, loadPage, loadLayout });
  await vi.waitFor(() => expect(navCtx()).toBeTruthy());
  return navCtx().progress;
}

async function mountLaunched() {
  const fetch = vi.fn(async (url: string, init?: RequestInit) =>
    url.includes('/statements') && init?.method === 'POST'
      ? respond(200, '[]')
      : respond(404),
  );
  vi.stubGlobal('fetch', fetch);
  setXAPILaunch({ registration: '2d8b1e1e-0000-4000-8000-000000000000' });

  const progress = await mount(new XAPIAdapter());
  const verbs = (): string[] =>
    postedStatements(fetch).map((s) => s.verb.display['en-US']);
  return { progress, fetch, verbs };
}

describe('a graded submit that decides the verdict', () => {
  it('reports the score on the verdict instead of a statement of its own', async () => {
    const { progress, fetch, verbs } = await mountLaunched();
    await vi.waitFor(() => expect(verbs()).toContain('initialized'));
    fetch.mockClear();

    progress.quizCompleted(0, 90);

    await vi.waitFor(() => expect(verbs()).toContain('passed'));
    await flush();

    expect(verbs()).not.toContain('scored');
  });

  it('sends the verdict once, not again from the success effect', async () => {
    const setSuccessStatus = vi.fn();
    const progress = await mount(stubAdapter({ setSuccessStatus }));
    await flush();

    progress.quizCompleted(0, 90);
    await flush();

    expect(setSuccessStatus.mock.calls.map(([status]) => status)).toEqual([
      'unknown',
      'passed',
    ]);
  });

  it('records a graded question in the layout against no page', async () => {
    vi.stubGlobal('__showLateCheck', undefined);
    const progress = await mount(stubAdapter(), {
      course: createManifest(1, {}, { 0: { graded: true } }),
      loadLayout: () => import('./fixtures/question-layout.svelte'),
      loadPage: () => import('./fixtures/app-page.svelte'),
    });
    await vi.waitFor(() =>
      expect(document.body.textContent).toContain('Test page'),
    );

    (globalThis as any).__showLateCheck();
    await flush();

    expect(progress.gradedUnits.size).toBe(0);
    expect(progress.successStatus).toBe('unknown');
  });

  it('holds the completion a later optional page would take back', async () => {
    const setCompletionStatus = vi.fn();
    const setExit = vi.fn();
    const saveState = vi.fn();
    const progress = await mount(
      stubAdapter({ setCompletionStatus, setExit, saveState }),
      {
        course: createManifest(
          2,
          { 0: { graded: true }, 1: { graded: true } },
          { 1: { required: false } },
        ),
      },
    );
    await flush();

    progress.quizCompleted(0, 90);
    await flush();

    progress.quizCompleted(1, 0);
    await flush();

    expect(progress.completionStatus).toBe('incomplete');
    expect(setCompletionStatus.mock.calls.map(([status]) => status)).toEqual([
      'incomplete',
      'complete',
    ]);

    window.dispatchEvent(new Event('pagehide'));

    expect(setExit).toHaveBeenCalledWith('normal');
    expect(saveState.mock.lastCall![0]).toMatchObject({ k: 1 });
  });
});
