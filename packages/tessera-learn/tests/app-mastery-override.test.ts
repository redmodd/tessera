// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';

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

async function mountWithMastery(masteryScore: number | undefined) {
  const config = {
    title: 'Demo',
    resume: 'auto',
    branding: {},
    navigation: { mode: 'free' },
    scoring: { passingScore: 70 },
    completion: { mode: 'quiz' },
    export: { standard: 'cmi5' },
  };
  const adapter = {
    init: () => Promise.resolve(),
    getState: () => null,
    getMasteryScore: () => masteryScore ?? null,
    saveState: () => {},
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
  (globalThis as any).__tesseraSeenPassingScore = [];
  (globalThis as any).__tesseraTest = {
    config,
    manifest,
    pageModules: Object.fromEntries(
      pages.map((p) => [p.importPath, () => new Promise(() => {})]),
    ),
    adapter,
    layout: (await import('./fixtures/mastery-layout.svelte')).default,
  };
  const App = (await import('../src/runtime/App.svelte')).default;
  const component = mount(App, { target: document.body });
  return { component, unmount };
}

describe('an LMS mastery override reaches a custom layout', () => {
  let cleanup: (() => void) | null = null;

  afterEach(() => {
    cleanup?.();
    cleanup = null;
    document.body.innerHTML = '';
    delete (globalThis as any).__tesseraTest;
    delete (globalThis as any).__tesseraSeenPassingScore;
  });

  it('re-renders useProgress().passingScore when the override lands', async () => {
    const { component, unmount } = await mountWithMastery(0.9);
    cleanup = () => unmount(component);

    await vi.waitFor(() => {
      expect((globalThis as any).__tesseraSeenPassingScore).toContain(90);
    });
  });

  it('keeps the course threshold when the LMS supplies none', async () => {
    const { component, unmount } = await mountWithMastery(undefined);
    cleanup = () => unmount(component);

    await vi.waitFor(() => {
      expect(
        (globalThis as any).__tesseraSeenPassingScore.length,
      ).toBeGreaterThan(0);
    });
    expect((globalThis as any).__tesseraSeenPassingScore).toEqual([70]);
  });
});
