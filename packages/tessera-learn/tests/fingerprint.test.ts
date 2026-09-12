import { describe, it, expect, beforeEach, vi } from 'vitest';
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

  it('discards state with no fingerprint', () => {
    expect(shouldRestore(savedWith(undefined), fp, 'auto')).toBe(false);
  });

  it('never restores when resume is "never"', () => {
    expect(shouldRestore(savedWith(fp), fp, 'never')).toBe(false);
  });

  it('defaults resume to "auto" when omitted', () => {
    expect(shouldRestore(savedWith(fp), fp)).toBe(true);
  });

  describe('malformed documents', () => {
    beforeEach(() => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
    });

    it.each([
      ['v is not an array', { v: 'nope' }],
      ['c is not a record', { c: 3 }],
      ['g is an array', { g: [] }],
      ['a page in g is not a record', { g: { '0': null } }],
      ['b is not a number', { b: '1' }],
      ['d is not a number', { d: '120' }],
      ['a visited page is not a number', { v: ['0', 1] }],
      ['a quiz score is not a number', { g: { '0': { s: '80' } } }],
      ['an attempt count is not a number', { g: { '0': { a: '2' } } }],
      [
        'a standalone score is not a number',
        { g: { '0': { q: { q1: '80' } } } },
      ],
      [
        'a standalone entry is not a [score, weight, graded] triple',
        { g: { '0': { q: { q1: [80] } } } },
      ],
      [
        'a standalone entry carries more than a graded flag',
        { g: { '0': { q: { q1: [80, 1, 1, 1] } } } },
      ],
      ['a quiz score is null', { g: { '0': { s: null } } }],
    ])('discards a saved document where %s', (_label, bad) => {
      const saved = { ...savedWith(fp), ...bad } as unknown as SavedState;
      expect(shouldRestore(saved, fp, 'auto')).toBe(false);
    });

    it.each([
      ['a number', 42],
      ['a string', 'nope'],
    ])('discards a saved document that parsed to %s', (_label, bad) => {
      expect(shouldRestore(bad as unknown as SavedState, fp, 'auto')).toBe(
        false,
      );
    });

    it('keeps a save whose standalone entries carry weights', () => {
      const saved = {
        ...savedWith(fp),
        g: { '0': { q: { q1: 80, q2: [100, 3, 1] } } },
      } as unknown as SavedState;
      expect(shouldRestore(saved, fp, 'auto')).toBe(true);
    });

    it('warns so a corrupt record is distinguishable from a first launch', () => {
      const saved = { ...savedWith(fp), g: [] } as unknown as SavedState;
      shouldRestore(saved, fp, 'auto');
      expect(console.warn).toHaveBeenCalledWith(
        'Tessera: discarding malformed resume state',
      );
    });
  });

  it.each([
    ['c is null', { c: null }],
    ['g is null', { g: null }],
    ['a graded unit carries only a score', { g: { '0': { s: 80 } } }],
  ])('restores a saved document where %s', (_label, nulled) => {
    const saved = { ...savedWith(fp), ...nulled } as unknown as SavedState;
    expect(shouldRestore(saved, fp, 'auto')).toBe(true);
  });
});
