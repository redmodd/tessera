// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { structureFingerprint } from '../src/runtime/fingerprint.js';

const page = {
  index: 0,
  title: 'Welcome',
  slug: 'welcome',
  importPath: '/pages/01-intro/01-lesson/welcome.svelte',
  quiz: null,
};
const secondPage = { ...page, index: 1, title: 'Next', slug: 'next' };

const manifest = {
  sections: [
    {
      title: 'Intro',
      slug: 'intro',
      lessons: [{ title: 'Lesson', slug: 'lesson', pages: [page, secondPage] }],
    },
  ],
  pages: [page, secondPage],
  totalPages: 2,
};

function makeConfig(resume: 'auto' | 'never') {
  return {
    title: 'Demo',
    resume,
    branding: {},
    navigation: { mode: 'free' },
    scoring: { passingScore: 80 },
    completion: { mode: 'percentage', percentageThreshold: 100 },
    export: { standard: 'web' },
  };
}

function makeAdapter(saved: unknown) {
  const seedLifecycle = vi.fn();
  const setCompletionStatus = vi.fn();
  const saveState = vi.fn();
  return {
    seedLifecycle,
    setCompletionStatus,
    saveState,
    adapter: {
      init: async () => {},
      getState: () => saved,
      seedLifecycle,
      saveState,
      setDuration: () => {},
      setExit: () => {},
      setScore: () => {},
      setCompletionStatus,
      setSuccessStatus: () => {},
      commit: () => {},
      terminate: () => {},
    },
  };
}

async function mountApp(
  resume: 'auto' | 'never',
  options: { saved?: unknown; pageLoadFails?: boolean } = {},
) {
  const savedState = options.saved ?? {
    b: 1,
    v: [0, 1],
    q: {},
    d: 42,
    f: structureFingerprint(manifest),
  };
  const { adapter, seedLifecycle, setCompletionStatus, saveState } =
    makeAdapter(savedState);
  // App.svelte imports config at module scope, so the stubs need re-evaluating
  // for the second mount to see a different resume mode. Svelte and the page
  // come from that same fresh registry or every $effect is orphaned against a
  // second runtime instance.
  vi.resetModules();
  const { mount, unmount } = await import('svelte');
  (globalThis as any).__tesseraTest = {
    config: makeConfig(resume),
    manifest,
    pageModules: {
      [page.importPath]: options.pageLoadFails
        ? () => Promise.reject(new Error('page module missing'))
        : () => import('./fixtures/app-page.svelte'),
    },
    adapter,
  };
  const App = (await import('../src/runtime/App.svelte')).default;
  const component = mount(App, { target: document.body });
  await vi.waitFor(() => expect(document.body.textContent).toBeTruthy());
  return { component, seedLifecycle, setCompletionStatus, saveState, unmount };
}

// shouldRestore itself is covered in fingerprint.test.ts. This covers the
// argument App.svelte passes into it: config.resume, not a hardcoded mode.
describe('App restore gate honours config.resume', () => {
  let cleanup: (() => void) | null = null;

  afterEach(() => {
    cleanup?.();
    cleanup = null;
    document.body.innerHTML = '';
    delete (globalThis as any).__tesseraTest;
  });

  it('restores saved state when resume is "auto"', async () => {
    const { component, seedLifecycle, unmount } = await mountApp('auto');
    cleanup = () => unmount(component);
    await vi.waitFor(() => expect(seedLifecycle).toHaveBeenCalled());
  });

  it('leaves a malformed saved record untouched', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { component, setCompletionStatus, saveState, unmount } =
      await mountApp('auto', {
        saved: {
          b: 1,
          v: [0, 1],
          q: null,
          d: 120,
          f: structureFingerprint(manifest),
        },
        pageLoadFails: true,
      });
    cleanup = () => {
      unmount(component);
      errors.mockRestore();
    };
    await vi.waitFor(() => expect(setCompletionStatus).toHaveBeenCalled());
    expect(saveState).not.toHaveBeenCalled();
  });

  it('ignores saved state when resume is "never"', async () => {
    const { component, seedLifecycle, setCompletionStatus, unmount } =
      await mountApp('never');
    cleanup = () => unmount(component);
    // App pushes completion status unconditionally just past the restore gate,
    // so waiting on it proves the gate ran and declined rather than that init
    // is still in flight.
    await vi.waitFor(() => expect(setCompletionStatus).toHaveBeenCalled());
    expect(seedLifecycle).not.toHaveBeenCalled();
  });
});
