// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import type { BaseAdapter } from '../src/runtime/adapters/base.js';
import type { SavedState } from '../src/runtime/persistence.js';
import {
  createManifest,
  mountApp,
  stubAdapter,
  useFakeTimers,
} from './helpers.js';

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

function mount(overrides: Partial<BaseAdapter>) {
  return mountApp({
    config,
    manifest,
    pageModules: {
      [manifest.pages[0].importPath]: () =>
        import('./fixtures/app-page.svelte'),
    },
    adapter: stubAdapter(overrides),
  });
}

// The first page is held until adapter.init() resolves, and the LMS handshake
// it performs has no deadline of its own.
describe('App bounds adapter.init()', () => {
  it('surfaces an error page when init never resolves', async () => {
    useFakeTimers();
    await mount({ init: () => new Promise(() => {}) });

    expect(document.body.textContent).not.toContain('This page failed to load');

    await vi.advanceTimersByTimeAsync(20_000);
    expect(document.body.textContent).toContain('This page failed to load');
    expect(document.body.textContent).toContain('adapter init timed out');
  });

  it('renders the page when init resolves inside the deadline', async () => {
    useFakeTimers();
    await mount({
      init: () => new Promise((resolve) => setTimeout(resolve, 100)),
    });

    await vi.advanceTimersByTimeAsync(20_000);
    expect(document.body.textContent).not.toContain('This page failed to load');
  });

  it('renders the page when loadState rejects', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await mount({
      loadState: async () => {
        throw new Error('LRS unreachable');
      },
    });

    await vi.waitFor(() =>
      expect(document.body.textContent).toContain('Test page'),
    );
    expect(document.body.textContent).not.toContain('This page failed to load');
  });

  it('renders the page when the saved state is malformed', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await mount({ getState: () => ({ d: 0 }) as SavedState });

    await vi.waitFor(() =>
      expect(document.body.textContent).toContain('Test page'),
    );
    expect(document.body.textContent).not.toContain('This page failed to load');
  });
});
