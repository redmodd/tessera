// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { XAPIAdapter } from '../src/runtime/adapters/xapi.js';

const ACTOR = {
  objectType: 'Agent',
  account: { homePage: 'https://lms', name: 'learner-1' },
};

const pages = [0].map((index) => ({
  index,
  title: `Page ${index}`,
  slug: `page-${index}`,
  importPath: `/pages/01-intro/01-lesson/page-${index}.svelte`,
  quiz: { graded: true },
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

async function mountLaunched() {
  const verbs: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: unknown, init?: { method?: string; body?: string }) => {
      if (String(url).includes('/statements') && init?.method === 'POST') {
        const body = JSON.parse(init.body!);
        for (const statement of Array.isArray(body) ? body : [body]) {
          verbs.push(statement.verb.display['en-US']);
        }
        return new Response('[]', { status: 200 });
      }
      return new Response('{}', { status: 404 });
    }),
  );

  const params = new URLSearchParams({
    endpoint: 'https://lrs.example/xapi',
    auth: 'Basic Zm9vOmJhcg==',
    actor: JSON.stringify(ACTOR),
    activity_id: 'urn:tessera:au:abc',
    registration: '2d8b1e1e-0000-4000-8000-000000000000',
  });
  window.history.replaceState({}, '', `/?${params}`);

  vi.resetModules();
  const { mount, unmount } = await import('svelte');
  (globalThis as any).__tesseraTest = {
    config: {
      title: 'Demo',
      resume: 'auto',
      branding: {},
      navigation: { mode: 'free' },
      scoring: { passingScore: 70 },
      completion: { mode: 'quiz' },
      export: { standard: 'xapi' },
    },
    manifest,
    pageModules: Object.fromEntries(
      pages.map((p) => [p.importPath, () => new Promise(() => {})]),
    ),
    adapter: new XAPIAdapter(),
    layout: (await import('./fixtures/mastery-layout.svelte')).default,
  };
  const App = (await import('../src/runtime/App.svelte')).default;
  const component = mount(App, { target: document.body });

  await vi.waitFor(() =>
    expect((globalThis as any).__tesseraNavCtx).toBeTruthy(),
  );
  const { progress } = (globalThis as any).__tesseraNavCtx;
  return { cleanup: () => unmount(component), progress, verbs };
}

describe('a graded submit that decides the verdict', () => {
  let cleanup: (() => void) | null = null;

  afterEach(() => {
    cleanup?.();
    cleanup = null;
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
    delete (globalThis as any).__tesseraTest;
    delete (globalThis as any).__tesseraNavCtx;
    window.history.replaceState({}, '', '/');
  });

  it('reports the score on the verdict instead of a statement of its own', async () => {
    const mounted = await mountLaunched();
    cleanup = mounted.cleanup;
    await vi.waitFor(() => expect(mounted.verbs).toContain('initialized'));
    mounted.verbs.length = 0;

    mounted.progress.quizCompleted(0, 90);

    await vi.waitFor(() => expect(mounted.verbs).toContain('passed'));
    await new Promise((r) => setTimeout(r, 50));

    expect(mounted.verbs).not.toContain('scored');
  });
});
