// @vitest-environment jsdom
import { describe, it, expect, onTestFinished, vi } from 'vitest';
import { createManifest, mountApp, stubAdapter } from './helpers.js';
import type { SavedState } from '../src/runtime/persistence.js';

const manifest = createManifest(1);

const config = {
  title: 'Demo',
  resume: 'auto',
  branding: {},
  navigation: { mode: 'free' },
  scoring: { passingScore: 80 },
  completion: { mode: 'percentage', percentageThreshold: 100 },
  export: { standard: 'web' },
};

function mount(
  init: () => Promise<void>,
  loadState?: () => Promise<void>,
  getState?: () => unknown,
) {
  return mountApp({
    config,
    manifest,
    pageModules: {
      [manifest.pages[0].importPath]: () =>
        import('./fixtures/app-page.svelte'),
    },
    adapter: stubAdapter({
      init,
      loadState,
      getState: getState as (() => SavedState | null) | undefined,
    }),
  });
}

// The first page is held until adapter.init() resolves, and the LMS handshake
// it performs has no deadline of its own.
describe('App bounds adapter.init()', () => {
  it('surfaces an error page when init never resolves', async () => {
    vi.useFakeTimers();
    onTestFinished(() => vi.useRealTimers());
    await mount(() => new Promise(() => {}));

    expect(document.body.textContent).not.toContain('This page failed to load');

    await vi.advanceTimersByTimeAsync(20_000);
    expect(document.body.textContent).toContain('This page failed to load');
    expect(document.body.textContent).toContain('adapter init timed out');
  });

  it('renders the page when init resolves inside the deadline', async () => {
    vi.useFakeTimers();
    onTestFinished(() => vi.useRealTimers());
    await mount(() => new Promise((resolve) => setTimeout(resolve, 100)));

    await vi.advanceTimersByTimeAsync(20_000);
    expect(document.body.textContent).not.toContain('This page failed to load');
  });

  it('renders the page when loadState rejects', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await mount(
      async () => {},
      async () => {
        throw new Error('LRS unreachable');
      },
    );

    await vi.waitFor(() =>
      expect(document.body.textContent).toContain('Test page'),
    );
    expect(document.body.textContent).not.toContain('This page failed to load');
  });

  it('renders the page when the saved state is malformed', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await mount(
      async () => {},
      undefined,
      () => ({ d: 0 }),
    );

    await vi.waitFor(() =>
      expect(document.body.textContent).toContain('Test page'),
    );
    expect(document.body.textContent).not.toContain('This page failed to load');
  });
});
