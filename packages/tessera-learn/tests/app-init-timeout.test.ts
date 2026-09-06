// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';

const page = {
  index: 0,
  title: 'Welcome',
  slug: 'welcome',
  importPath: '/pages/01-intro/01-lesson/welcome.svelte',
  quiz: null,
};

const manifest = {
  sections: [
    {
      title: 'Intro',
      slug: 'intro',
      lessons: [{ title: 'Lesson', slug: 'lesson', pages: [page] }],
    },
  ],
  pages: [page],
  totalPages: 1,
};

const config = {
  title: 'Demo',
  resume: 'auto',
  branding: {},
  navigation: { mode: 'free' },
  scoring: { passingScore: 80 },
  completion: { mode: 'percentage', percentageThreshold: 100 },
  export: { standard: 'web' },
};

function makeAdapter(init: () => Promise<void>) {
  return {
    init,
    getState: () => null,
    loadState: async () => {},
    saveState: () => {},
    setDuration: () => {},
    setExit: () => {},
    setScore: () => {},
    setCompletionStatus: () => {},
    setSuccessStatus: () => {},
    commit: () => {},
    terminate: () => {},
  };
}

async function mountApp(init: () => Promise<void>) {
  vi.resetModules();
  const { mount, unmount } = await import('svelte');
  (globalThis as any).__tesseraTest = {
    config,
    manifest,
    pageModules: {
      [page.importPath]: () => import('./fixtures/app-page.svelte'),
    },
    adapter: makeAdapter(init),
  };
  const App = (await import('../src/runtime/App.svelte')).default;
  const component = mount(App, { target: document.body });
  return { component, unmount };
}

// The first page is held until adapter.init() resolves, and the LMS handshake
// it performs has no deadline of its own. Without the race in App.svelte a
// wedged LMS leaves the learner on the loading bar with no way out.
describe('App bounds adapter.init()', () => {
  let cleanup: (() => void) | null = null;

  afterEach(() => {
    cleanup?.();
    cleanup = null;
    vi.useRealTimers();
    document.body.innerHTML = '';
    delete (globalThis as any).__tesseraTest;
  });

  it('surfaces an error page when init never resolves', async () => {
    vi.useFakeTimers();
    const { component, unmount } = await mountApp(() => new Promise(() => {}));
    cleanup = () => unmount(component);

    expect(document.body.textContent).not.toContain('This page failed to load');

    await vi.advanceTimersByTimeAsync(20_000);
    expect(document.body.textContent).toContain('This page failed to load');
    expect(document.body.textContent).toContain('adapter init timed out');
  });

  it('renders the page when init resolves inside the deadline', async () => {
    vi.useFakeTimers();
    const { component, unmount } = await mountApp(
      () => new Promise((resolve) => setTimeout(resolve, 100)),
    );
    cleanup = () => unmount(component);

    await vi.advanceTimersByTimeAsync(20_000);
    expect(document.body.textContent).not.toContain('This page failed to load');
  });
});
