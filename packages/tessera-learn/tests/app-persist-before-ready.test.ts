// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { structureFingerprint } from '../src/runtime/fingerprint.js';

const pages = [0].map((index) => ({
  index,
  title: `Page ${index}`,
  slug: `page-${index}`,
  importPath: `/pages/01-intro/01-lesson/page-${index}.svelte`,
  quiz: null,
}));

const manifest = {
  sections: [
    {
      title: 'Intro',
      slug: 'intro',
      lessons: [{ title: 'Lesson', slug: 'lesson', pages }],
    },
  ],
  pages,
  totalPages: pages.length,
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

// The layout writes through usePersistence() during init and the page never
// loads, so the flip to persistenceReady is the only thing that can flush it.
async function mountWithSlowInit(
  savedState: object | null = null,
  { skipLayout = false } = {},
) {
  let releaseInit: () => void;
  const initGate = new Promise<void>((resolve) => {
    releaseInit = resolve;
  });
  const saveState = vi.fn();
  const adapter = {
    init: () => initGate,
    getState: () => savedState,
    saveState,
    setDuration: () => {},
    setExit: () => {},
    setScore: () => {},
    setCompletionStatus: () => {},
    setSuccessStatus: () => {},
    commit: () => {},
    terminate: () => {},
  };

  vi.resetModules();
  const { mount, unmount } = await import('svelte');
  (globalThis as any).__tesseraTest = {
    config,
    manifest,
    pageModules: Object.fromEntries(
      pages.map((p) => [p.importPath, () => new Promise(() => {})]),
    ),
    adapter,
    // Imported after resetModules so it binds the same Svelte instance as App
    // and can read its context.
    ...(skipLayout
      ? {}
      : {
          layout: (await import('./fixtures/persisting-layout.svelte')).default,
        }),
  };
  const App = (await import('../src/runtime/App.svelte')).default;
  const component = mount(App, { target: document.body });
  return { component, saveState, releaseInit: releaseInit!, unmount };
}

describe('state changed during adapter init survives', () => {
  let cleanup: (() => void) | null = null;

  afterEach(() => {
    cleanup?.();
    cleanup = null;
    document.body.innerHTML = '';
    delete (globalThis as any).__tesseraTest;
  });

  it('persists a write made before the adapter is ready', async () => {
    const { component, saveState, releaseInit, unmount } =
      await mountWithSlowInit();
    cleanup = () => unmount(component);

    expect(saveState).not.toHaveBeenCalled();

    releaseInit();

    await vi.waitFor(() => {
      expect(saveState).toHaveBeenCalled();
      expect(saveState.mock.calls.at(-1)![0].u).toEqual({
        'layout-note': 'written-before-ready',
      });
    });
  });

  it('keeps the write when a saved document is restored over it', async () => {
    const { component, saveState, releaseInit, unmount } =
      await mountWithSlowInit({
        b: 0,
        f: structureFingerprint(manifest as never),
        v: [0],
        q: {},
        d: 0,
        u: { 'other-note': 'from-a-previous-session' },
      });
    cleanup = () => unmount(component);

    releaseInit();

    await vi.waitFor(() => {
      expect(saveState).toHaveBeenCalled();
      expect(saveState.mock.calls.at(-1)![0].u).toEqual({
        'layout-note': 'written-before-ready',
        'other-note': 'from-a-previous-session',
      });
    });
  });

  it('does not write at launch when nothing changed', async () => {
    const saved = {
      b: 0,
      f: 'stale-fingerprint',
      v: [0],
      q: {},
      d: 0,
      u: { 'other-note': 'from-a-previous-session' },
    };
    const { component, saveState, releaseInit, unmount } =
      await mountWithSlowInit(saved, { skipLayout: true });
    cleanup = () => unmount(component);

    releaseInit();
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(saveState).not.toHaveBeenCalled();
  });
});
