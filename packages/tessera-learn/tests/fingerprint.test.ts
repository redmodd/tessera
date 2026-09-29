import { describe, it, expect, vi } from 'vitest';
import {
  structureFingerprint,
  shouldRestore,
} from '../src/runtime/fingerprint.js';
import type { SavedState } from '../src/runtime/persistence.js';
import type { Manifest, ManifestPage } from '../src/plugin/manifest.js';

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

const savedWith = (f?: string): SavedState => ({
  b: 1,
  v: [0, 1],
  d: 5,
  ...(f !== undefined ? { f } : {}),
});

describe('structureFingerprint', () => {
  it('is stable for the same ordered slugs', () => {
    expect(structureFingerprint(manifestOf('intro', 'quiz'))).toBe(
      structureFingerprint(manifestOf('intro', 'quiz')),
    );
  });

  it('changes when a page is reordered, added, or renamed', () => {
    const base = structureFingerprint(manifestOf('intro', 'quiz'));
    expect(structureFingerprint(manifestOf('quiz', 'intro'))).not.toBe(base);
    expect(
      structureFingerprint(manifestOf('intro', 'quiz', 'summary')),
    ).not.toBe(base);
    expect(structureFingerprint(manifestOf('intro', 'test'))).not.toBe(base);
  });
});

describe('shouldRestore', () => {
  const fp = structureFingerprint(manifestOf('intro', 'quiz'));

  it('restores when the saved fingerprint matches', () => {
    expect(shouldRestore(savedWith(fp), fp, 'auto')).toBe(true);
  });

  it('discards when the saved fingerprint differs (structure changed)', () => {
    expect(shouldRestore(savedWith('stale'), fp, 'auto')).toBe(false);
  });

  it('discards a blob written by a runtime with the older saved-state layout', () => {
    const legacyFingerprint = (...slugs: string[]) => {
      const joined = slugs.join('\0');
      let h = 0x811c9dc5;
      for (let i = 0; i < joined.length; i++) {
        h ^= joined.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
      }
      return (h >>> 0).toString(36);
    };
    const legacy = {
      b: 1,
      v: [0, 1],
      d: 5,
      q: { '1': 80 },
      qa: { '1': 2 },
      s: { '1': { q1: 100 } },
      gs: [1],
      f: legacyFingerprint('intro', 'quiz'),
    } as unknown as SavedState;
    expect(shouldRestore(legacy, fp, 'auto')).toBe(false);
  });

  it('discards state with no fingerprint', () => {
    expect(shouldRestore(savedWith(undefined), fp, 'auto')).toBe(false);
  });

  it('never restores when resume is "never"', () => {
    expect(shouldRestore(savedWith(fp), fp, 'never')).toBe(false);
  });

  it('defaults resume to "auto" when omitted', () => {
    expect(shouldRestore(savedWith(fp), fp)).toBe(true);
  });

  it.each([
    ['a number', 42],
    ['a string', 'nope'],
  ])('discards a saved document that parsed to %s', (_label, bad) => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(shouldRestore(bad as unknown as SavedState, fp, 'auto')).toBe(false);
  });
});
