// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { stubAdapter } from './helpers.js';
import type { SavedState } from '../src/runtime/persistence.js';
import { structureFingerprint } from '../src/runtime/fingerprint.js';

const pages = [
  {
    index: 0,
    title: 'Exam',
    slug: 'exam',
    importPath: '/exam.svelte',
    quiz: { graded: true },
  },
  {
    index: 1,
    title: 'Practice',
    slug: 'practice',
    importPath: '/practice.svelte',
    required: false,
    quiz: { graded: true },
  },
];

const manifest = {
  sections: [
    { title: 'S', slug: 's', lessons: [{ title: 'L', slug: 'l', pages }] },
  ],
  pages,
  totalPages: 2,
};

const config = {
  title: 'Demo',
  resume: 'auto',
  branding: {},
  navigation: { mode: 'free' },
  scoring: { passingScore: 70 },
  completion: { mode: 'quiz' },
  export: { standard: 'scorm12' },
};

async function mountApp(saved: SavedState | null) {
  const setCompletionStatus = vi.fn();
  const setExit = vi.fn();
  const saveState = vi.fn();
  const adapter = stubAdapter({
    getState: () => saved,
    setCompletionStatus,
    setExit,
    saveState,
    seedLifecycle: vi.fn(() => true),
  });
  vi.resetModules();
  const { mount, unmount } = await import('svelte');
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
  await vi.waitFor(() =>
    expect((globalThis as any).__tesseraNavCtx).toBeTruthy(),
  );
  const { progress } = (globalThis as any).__tesseraNavCtx;
  return {
    progress,
    setCompletionStatus,
    setExit,
    saveState,
    unmount: () => unmount(component),
  };
}

afterEach(() => {
  document.body.innerHTML = '';
  delete (globalThis as any).__tesseraNavCtx;
});

describe('completion latch at the adapter boundary', () => {
  it('never reports incomplete after an optional page re-grades the course', async () => {
    const first = await mountApp(null);
    first.progress.quizCompleted(0, 100);
    await vi.waitFor(() =>
      expect(first.setCompletionStatus).toHaveBeenCalledWith('complete'),
    );

    first.progress.quizCompleted(1, 0);
    window.dispatchEvent(new Event('pagehide'));

    expect(first.progress.completionStatus).toBe('incomplete');
    expect(first.setCompletionStatus.mock.calls.flat()).not.toContain(
      'incomplete',
    );
    expect(first.setExit).toHaveBeenCalledWith('normal');

    const saved = first.saveState.mock.calls.at(-1)![0] as SavedState;
    expect(saved.k).toBe(1);
    first.unmount();

    const second = await mountApp({
      ...saved,
      f: structureFingerprint(manifest as never),
    });
    await vi.waitFor(() =>
      expect(second.setCompletionStatus).toHaveBeenCalled(),
    );

    expect(second.setCompletionStatus.mock.calls.flat()).not.toContain(
      'incomplete',
    );
    second.unmount();
  });
});
