// @vitest-environment jsdom
import { describe, it, expect, vi, onTestFinished } from 'vitest';
import {
  createConfig,
  createManifest,
  mountApp,
  navCtx,
  stubAdapter,
} from './helpers.js';

const showsErrorPage = () =>
  vi.waitFor(() =>
    expect(document.body.textContent).toContain('This page failed to load'),
  );

describe('a page that throws while rendering', () => {
  it('shows the error page in the course chrome', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await mountApp({
      config: createConfig({ resume: 'auto' }),
      manifest: createManifest(2),
      adapter: stubAdapter(),
      loadPage: () => import('./fixtures/question-no-id-page.svelte'),
    });

    await showsErrorPage();
    expect(document.body.textContent).toContain('needs an id');
    expect(document.querySelector('.tessera-nav, nav')).not.toBeNull();
  });

  it('still records the visit and completion, and leaves focus alone', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    let broken = false;
    await mountApp({
      config: createConfig({
        resume: 'auto',
        completion: { mode: 'manual', requireSuccessStatus: 'passed' },
      }),
      manifest: createManifest(2, {}, { 1: { completesOn: 'view' } }),
      adapter: stubAdapter(),
      loadPage: () =>
        broken
          ? import('./fixtures/question-no-id-page.svelte')
          : import('./fixtures/app-page.svelte'),
      loadLayout: () => import('./fixtures/mastery-layout.svelte'),
    });
    await vi.waitFor(() =>
      expect(document.body.textContent).toContain('Test page'),
    );
    const { nav, progress } = navCtx();

    broken = true;
    nav.goToPage(1);
    await showsErrorPage();
    await new Promise((r) => setTimeout(r, 0));

    expect(progress.visitedPages.has(1)).toBe(true);
    expect(progress.toSaved().m).toBe(1);
    expect(document.querySelector('[data-tessera-page-focus]')).toBeNull();
  });
  it('leaves the next page alone when the last one throws while tearing down', async () => {
    // A second listener tells Vitest the error is handled. Svelte's flush
    // surfaces it as either event.
    const escaped: unknown[] = [];
    const onEscape = (err: unknown) => escaped.push(err);
    const events = ['uncaughtException', 'unhandledRejection'] as const;
    for (const event of events) process.on(event, onEscape);
    onTestFinished(() => {
      for (const event of events) process.off(event, onEscape);
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    let next = false;
    await mountApp({
      config: createConfig({}),
      manifest: createManifest(2),
      adapter: stubAdapter(),
      loadPage: () =>
        next
          ? import('./fixtures/app-page.svelte')
          : import('./fixtures/throw-on-destroy-page.svelte'),
      loadLayout: () => import('./fixtures/mastery-layout.svelte'),
    });
    await vi.waitFor(() =>
      expect(document.body.textContent).toContain('Leaving page'),
    );

    next = true;
    navCtx().nav.goToPage(1);
    await vi.waitFor(() =>
      expect(document.body.textContent).toContain('Test page'),
    );
    await vi.waitFor(() => expect(escaped).toHaveLength(1));
    expect(document.body.textContent).not.toContain('failed to load');
  });
});

describe('page bookkeeping under sequential navigation', () => {
  it('counts the page as visited by the time it mounts', async () => {
    await mountApp({
      config: createConfig({ navigation: { mode: 'sequential' } }),
      manifest: createManifest(2),
      adapter: stubAdapter(),
      loadPage: () => import('./fixtures/next-on-mount-page.svelte'),
      loadLayout: () => import('./fixtures/mastery-layout.svelte'),
    });
    await vi.waitFor(() =>
      expect((globalThis as any).__tesseraCanGoNextAtMount).toBeDefined(),
    );
    expect((globalThis as any).__tesseraCanGoNextAtMount).toBe(true);
  });

  it('lets the learner move past a page that fails to render', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await mountApp({
      config: createConfig({ navigation: { mode: 'sequential' } }),
      manifest: createManifest(2),
      adapter: stubAdapter(),
      loadPage: () => import('./fixtures/question-no-id-page.svelte'),
      loadLayout: () => import('./fixtures/mastery-layout.svelte'),
    });
    await showsErrorPage();
    await new Promise((r) => setTimeout(r, 0));
    expect(navCtx().nav.canGoNext).toBe(true);
  });
});
