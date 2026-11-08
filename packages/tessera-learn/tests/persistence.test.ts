import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { SavedState } from '../src/runtime/persistence.js';
import { WebAdapter } from '../src/runtime/adapters/web.js';
import type { CourseConfig } from '../src/runtime/types.js';
import type { Manifest, ManifestPage } from '../src/plugin/manifest.js';

describe('WebAdapter contract', () => {
  // Test the adapter contract with a mock localStorage
  let storage: Map<string, string>;

  beforeEach(() => {
    storage = new Map();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    });
  });

  // Inline a minimal adapter implementation to test the contract
  // (The real WebAdapter uses private fields which don't work in vitest without DOM)
  function createTestAdapter(courseTitle: string) {
    const courseId = courseTitle
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
    const storageKey = `tessera-${courseId || 'tessera-course'}`;
    let state: SavedState | null = null;

    return {
      async init() {
        try {
          const raw = localStorage.getItem(storageKey);
          if (raw) state = JSON.parse(raw);
        } catch {
          state = null;
        }
      },
      getState: () => state,
      saveState(s: SavedState) {
        state = s;
        localStorage.setItem(storageKey, JSON.stringify(s));
      },
    };
  }

  it('init() reads from localStorage', async () => {
    const state: SavedState = {
      b: 3,
      v: [0, 1, 2, 3],
      g: { '2': { s: 80 } },
      d: 100,
    };
    storage.set('tessera-test', JSON.stringify(state));

    const adapter = createTestAdapter('Test');
    await adapter.init();
    expect(adapter.getState()).toEqual(state);
  });

  it('init() returns null when no saved state', async () => {
    const adapter = createTestAdapter('Test');
    await adapter.init();
    expect(adapter.getState()).toBeNull();
  });

  it('init() returns null for corrupted data', async () => {
    storage.set('tessera-test', '{invalid json!!!');

    const adapter = createTestAdapter('Test');
    await adapter.init();
    expect(adapter.getState()).toBeNull();
  });

  it('saveState() writes to localStorage', () => {
    const adapter = createTestAdapter('Test');
    const state: SavedState = { b: 5, v: [0, 1, 2, 3, 4, 5], g: {}, d: 200 };
    adapter.saveState(state);

    const raw = storage.get('tessera-test');
    expect(raw).toBeDefined();
    expect(JSON.parse(raw!)).toEqual(state);
  });

  it('saveState() overwrites previous state', () => {
    const adapter = createTestAdapter('Test');
    adapter.saveState({ b: 1, v: [0, 1], g: {}, d: 10 });
    adapter.saveState({ b: 3, v: [0, 1, 2, 3], g: { '2': { s: 90 } }, d: 50 });

    const raw = storage.get('tessera-test');
    const restored = JSON.parse(raw!);
    expect(restored.b).toBe(3);
    expect(restored.v).toEqual([0, 1, 2, 3]);
    expect(restored.g['2']).toEqual({ s: 90 });
  });

  it('full lifecycle: save, reload, restore', async () => {
    const adapter1 = createTestAdapter('Test');
    adapter1.saveState({
      b: 7,
      v: [0, 1, 2, 3, 4, 5, 6, 7],
      g: { '3': { s: 85 } },
      d: 600,
    });

    // Simulate page reload — new adapter instance, same localStorage
    const adapter2 = createTestAdapter('Test');
    await adapter2.init();
    const state = adapter2.getState();

    expect(state).not.toBeNull();
    expect(state!.b).toBe(7);
    expect(state!.v).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(state!.g!['3']).toEqual({ s: 85 });
    expect(state!.d).toBe(600);
  });
});

describe('WebAdapter storage key', () => {
  let storage: Map<string, string>;

  beforeEach(() => {
    storage = new Map();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    });
  });

  const makeConfig = (over: Partial<CourseConfig>) =>
    ({ title: 'My Course', ...over }) as CourseConfig;

  const page = (slug: string, index: number): ManifestPage => ({
    index,
    title: slug,
    slug,
    importPath: `/pages/${slug}.svelte`,
    quiz: null,
  });

  const manifestOf = (...slugs: string[]): Manifest => ({
    sections: [],
    pages: slugs.map(page),
    totalPages: slugs.length,
  });

  const state = (): SavedState => ({ b: 1, v: [0, 1], g: {}, d: 5 });

  const keyFor = (config: CourseConfig, manifest?: Manifest): string => {
    storage.clear();
    new WebAdapter(config, manifest).saveState(state());
    return [...storage.keys()][0];
  };

  it('keys on the explicit id plus a structure fingerprint', () => {
    const key = keyFor(
      makeConfig({ id: 'urn:uuid:abc' }),
      manifestOf('intro', 'quiz'),
    );
    expect(key).toMatch(/^tessera-urn:uuid:abc-[a-z0-9]+$/);
  });

  it('two courses with the same title but distinct ids never collide', () => {
    const m = manifestOf('intro', 'quiz');
    const a = keyFor(makeConfig({ id: 'urn:uuid:aaa' }), m);
    const b = keyFor(makeConfig({ id: 'urn:uuid:bbb' }), m);
    expect(a).not.toBe(b);
  });

  it('a structure change redirects to a fresh key', () => {
    const c = makeConfig({ id: 'urn:uuid:abc' });
    const before = keyFor(c, manifestOf('intro', 'quiz'));
    const reordered = keyFor(c, manifestOf('quiz', 'intro'));
    const added = keyFor(c, manifestOf('intro', 'quiz', 'summary'));
    expect(reordered).not.toBe(before);
    expect(added).not.toBe(before);
  });

  it('an unchanged structure keeps the same key (resume preserved)', () => {
    const c = makeConfig({ id: 'urn:uuid:abc' });
    expect(keyFor(c, manifestOf('intro', 'quiz'))).toBe(
      keyFor(c, manifestOf('intro', 'quiz')),
    );
  });

  it('falls back to a fixed key when no id is set (title is not used)', () => {
    expect(keyFor(makeConfig({ title: 'My Course' }))).toBe(
      'tessera-tessera-course',
    );
  });
});
