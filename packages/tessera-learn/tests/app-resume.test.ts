// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { stubAdapter } from './helpers.js';
import type { SavedState } from '../src/runtime/persistence.js';
import { structureFingerprint } from '../src/runtime/fingerprint.js';

const page = {
  index: 0,
  title: 'Welcome',
  slug: 'welcome',
  importPath: '/pages/01-intro/01-lesson/welcome.svelte',
  quiz: null,
};
const secondPage = {
  ...page,
  index: 1,
  title: 'Next',
  slug: 'next',
  graded: true,
};

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

function savedWith(fields: object) {
  return {
    b: 1,
    v: [0, 1],
    d: 120,
    f: structureFingerprint(manifest),
    ...fields,
  };
}

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

function makeAdapter(saved: unknown, seeds: boolean) {
  const seedLifecycle = vi.fn(() => seeds);
  const setCompletionStatus = vi.fn();
  const saveState = vi.fn();
  const setScore = vi.fn();
  return {
    seedLifecycle,
    setCompletionStatus,
    saveState,
    setScore,
    adapter: stubAdapter({
      getState: () => saved as SavedState | null,
      seedLifecycle,
      saveState,
      setScore,
      setCompletionStatus,
    }),
  };
}

async function mountApp(
  resume: 'auto' | 'never',
  options: {
    saved?: unknown;
    pageModule?: () => Promise<unknown>;
    seeds?: boolean;
  } = {},
) {
  const { adapter, seedLifecycle, setCompletionStatus, saveState, setScore } =
    makeAdapter(options.saved ?? savedWith({}), options.seeds ?? true);
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
      [page.importPath]:
        options.pageModule ?? (() => import('./fixtures/app-page.svelte')),
    },
    adapter,
  };
  const App = (await import('../src/runtime/App.svelte')).default;
  const component = mount(App, { target: document.body });
  await vi.waitFor(() => expect(document.body.textContent).toBeTruthy());
  return {
    component,
    seedLifecycle,
    setCompletionStatus,
    saveState,
    setScore,
    unmount,
  };
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
    const warns = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { component, seedLifecycle, setCompletionStatus, unmount } =
      await mountApp('auto', { saved: savedWith({ g: [] }) });
    cleanup = () => {
      unmount(component);
      warns.mockRestore();
    };
    await vi.waitFor(() => expect(setCompletionStatus).toHaveBeenCalled());
    expect(seedLifecycle).not.toHaveBeenCalled();
    expect(setCompletionStatus).not.toHaveBeenCalledWith('complete');
  });

  it('restores every optional field intact', async () => {
    const saved = savedWith({
      c: { '1': 2 },
      g: { '0': { s: 80, a: 3 }, '1': { q: { q1: 100 } } },
    });
    const { component, saveState, unmount } = await mountApp('auto', { saved });
    cleanup = () => unmount(component);
    await vi.waitFor(() => expect(saveState).toHaveBeenCalled());
    expect(saveState.mock.calls.at(-1)[0]).toMatchObject({
      v: [0, 1],
      d: 120,
      c: { '1': 2 },
      g: { '0': { s: 80, a: 3 }, '1': { q: { q1: 100 } } },
    });
  });

  it('round-trips a weighted standalone question as [score, weight, graded]', async () => {
    const saved = savedWith({ g: { '1': { q: { q1: 100, q2: [40, 3, 1] } } } });
    const { component, saveState, unmount } = await mountApp('auto', { saved });
    cleanup = () => unmount(component);
    await vi.waitFor(() => expect(saveState).toHaveBeenCalled());
    expect(saveState.mock.calls.at(-1)[0]).toMatchObject({
      g: { '1': { q: { q1: 100, q2: [40, 3, 1] } } },
    });
  });

  it('saves a restored answer whose question is no longer graded as ungraded', async () => {
    const { component, saveState, unmount } = await mountApp('auto', {
      saved: savedWith({ g: { '1': { q: { q1: 100 } } } }),
      pageModule: () => import('./fixtures/app-page-practice.svelte'),
    });
    cleanup = () => unmount(component);
    await vi.waitFor(() => expect(saveState).toHaveBeenCalled());
    expect(saveState.mock.calls.at(-1)[0]).toMatchObject({
      g: { '1': { q: { q1: [100, 1, 0] } } },
    });
  });

  const scoredSave = savedWith({
    g: { '1': { q: { q1: 100, q2: [0, 2, 1] } } },
  });

  it('reports no score for a resume that only restores what was saved', async () => {
    const { component, saveState, seedLifecycle, setScore, unmount } =
      await mountApp('auto', { saved: scoredSave });
    cleanup = () => unmount(component);
    await vi.waitFor(() => expect(saveState).toHaveBeenCalled());
    expect(seedLifecycle).toHaveBeenCalledWith('complete', 'failed', 33.33);
    expect(setScore).not.toHaveBeenCalled();
  });

  it('re-reports the restored score to an adapter that does not seed', async () => {
    const { component, setScore, unmount } = await mountApp('auto', {
      saved: scoredSave,
      seeds: false,
    });
    cleanup = () => unmount(component);
    await vi.waitFor(() => expect(setScore).toHaveBeenCalledWith(33.33));
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
