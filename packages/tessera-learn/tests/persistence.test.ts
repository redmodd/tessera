import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { SavedState } from '../src/runtime/persistence.js';
import { WebAdapter } from '../src/runtime/adapters/web.js';
import type { CourseConfig } from '../src/runtime/types.js';
import type { Manifest, ManifestPage } from '../src/plugin/manifest.js';

// We can't import WebAdapter directly in a Node test (no localStorage),
// so we test the serialization logic and adapter contract here.

describe('SavedState serialization', () => {
  it('serializes to compact JSON with single-letter keys', () => {
    const state: SavedState = {
      b: 5,
      v: [0, 1, 2, 3, 4, 5],
      q: { '3': 85, '7': 90 },
      d: 1234,
    };
    const json = JSON.stringify(state);
    expect(json).toContain('"b":5');
    expect(json).toContain('"v":[0,1,2,3,4,5]');
    expect(json).toContain('"q":{"3":85,"7":90}');
    expect(json).toContain('"d":1234');
  });

  it('deserializes back to the same structure', () => {
    const state: SavedState = {
      b: 3,
      v: [0, 1, 2, 3],
      q: { '2': 100 },
      d: 500,
    };
    const json = JSON.stringify(state);
    const restored: SavedState = JSON.parse(json);
    expect(restored.b).toBe(3);
    expect(restored.v).toEqual([0, 1, 2, 3]);
    expect(restored.q['2']).toBe(100);
    expect(restored.d).toBe(500);
  });

  it('200-page course with 5 quizzes stays under 4096 chars', () => {
    const state: SavedState = {
      b: 199,
      v: Array.from({ length: 200 }, (_, i) => i),
      q: { '20': 85, '50': 90, '100': 75, '150': 95, '180': 60 },
      d: 36000,
    };
    const json = JSON.stringify(state);
    expect(json.length).toBeLessThan(4096);
  });

  it('empty state is valid', () => {
    const state: SavedState = { b: 0, v: [], q: {}, d: 0 };
    const json = JSON.stringify(state);
    const restored: SavedState = JSON.parse(json);
    expect(restored.b).toBe(0);
    expect(restored.v).toEqual([]);
    expect(Object.keys(restored.q)).toHaveLength(0);
    expect(restored.d).toBe(0);
  });
});

describe('State serialization helpers', () => {
  function serializeState(
    currentPageIndex: number,
    visitedPages: Set<number>,
    quizScores: Map<number, number>,
    durationSeconds: number,
  ): SavedState {
    const q: Record<string, number> = {};
    for (const [pageIndex, score] of quizScores) {
      q[String(pageIndex)] = score;
    }
    return {
      b: currentPageIndex,
      v: [...visitedPages],
      q,
      d: durationSeconds,
    };
  }

  function restoreState(state: SavedState): {
    currentPageIndex: number;
    visitedPages: Set<number>;
    quizScores: Map<number, number>;
    durationSeconds: number;
  } {
    return {
      currentPageIndex: state.b,
      visitedPages: new Set(state.v),
      quizScores: new Map(
        Object.entries(state.q).map(([k, v]) => [Number(k), v]),
      ),
      durationSeconds: state.d,
    };
  }

  it('round-trips through serialize → deserialize', () => {
    const visited = new Set([0, 1, 2, 5, 8]);
    const scores = new Map([
      [3, 85],
      [7, 90],
    ]);

    const saved = serializeState(5, visited, scores, 1234);
    const json = JSON.stringify(saved);
    const parsed: SavedState = JSON.parse(json);
    const restored = restoreState(parsed);

    expect(restored.currentPageIndex).toBe(5);
    expect(restored.visitedPages).toEqual(new Set([0, 1, 2, 5, 8]));
    expect(restored.quizScores).toEqual(
      new Map([
        [3, 85],
        [7, 90],
      ]),
    );
    expect(restored.durationSeconds).toBe(1234);
  });

  it('handles empty quiz scores', () => {
    const saved = serializeState(0, new Set([0]), new Map(), 10);
    const restored = restoreState(saved);
    expect(restored.quizScores.size).toBe(0);
  });

  it('quiz score keys survive JSON round-trip as numbers', () => {
    const scores = new Map([[42, 100]]);
    const saved = serializeState(0, new Set(), scores, 0);
    const json = JSON.stringify(saved);
    const parsed: SavedState = JSON.parse(json);
    // JSON keys are always strings
    expect(parsed.q['42']).toBe(100);
    // restoreState converts back to number keys
    const restored = restoreState(parsed);
    expect(restored.quizScores.get(42)).toBe(100);
  });
});

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
    const state: SavedState = { b: 3, v: [0, 1, 2, 3], q: { '2': 80 }, d: 100 };
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
    const state: SavedState = { b: 5, v: [0, 1, 2, 3, 4, 5], q: {}, d: 200 };
    adapter.saveState(state);

    const raw = storage.get('tessera-test');
    expect(raw).toBeDefined();
    expect(JSON.parse(raw!)).toEqual(state);
  });

  it('saveState() overwrites previous state', () => {
    const adapter = createTestAdapter('Test');
    adapter.saveState({ b: 1, v: [0, 1], q: {}, d: 10 });
    adapter.saveState({ b: 3, v: [0, 1, 2, 3], q: { '2': 90 }, d: 50 });

    const raw = storage.get('tessera-test');
    const restored = JSON.parse(raw!);
    expect(restored.b).toBe(3);
    expect(restored.v).toEqual([0, 1, 2, 3]);
    expect(restored.q['2']).toBe(90);
  });

  it('full lifecycle: save, reload, restore', async () => {
    const adapter1 = createTestAdapter('Test');
    adapter1.saveState({
      b: 7,
      v: [0, 1, 2, 3, 4, 5, 6, 7],
      q: { '3': 85 },
      d: 600,
    });

    // Simulate page reload — new adapter instance, same localStorage
    const adapter2 = createTestAdapter('Test');
    await adapter2.init();
    const state = adapter2.getState();

    expect(state).not.toBeNull();
    expect(state!.b).toBe(7);
    expect(state!.v).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(state!.q['3']).toBe(85);
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

  const state = (): SavedState => ({ b: 1, v: [0, 1], q: {}, d: 5 });

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
