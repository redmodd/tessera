// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
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
    expect(document.body.textContent).toContain('has no id');
    expect(document.querySelector('.tessera-nav, nav')).not.toBeNull();
  });

  it('records no visit or completion and leaves focus alone', async () => {
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

    expect(progress.visitedPages.has(1)).toBe(false);
    expect(progress.toSaved().m).toBeUndefined();
    expect(document.querySelector('[data-tessera-page-focus]')).toBeNull();
  });
});
