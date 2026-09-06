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
  q: {},
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

  it('restores legacy state with no fingerprint (backward compatible)', () => {
    expect(shouldRestore(savedWith(undefined), fp, 'auto')).toBe(true);
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
      ['q is null', { q: null }],
      ['q is an array', { q: [] }],
      ['c is not a record', { c: 3 }],
      ['s is not a record', { s: [] }],
      ['a page in s is not a record', { s: { '0': null } }],
      ['gs is not an array', { gs: {} }],
      ['qa is not a record', { qa: 'nope' }],
      ['b is not a number', { b: '1' }],
      ['d is not a number', { d: '120' }],
      ['a visited page is not a number', { v: ['0', 1] }],
      ['a quiz score is not a number', { q: { '0': '80' } }],
      ['a standalone score is not a number', { s: { '0': { q1: '80' } } }],
      ['a graded standalone page is not a number', { gs: ['0'] }],
    ])('discards a saved document where %s', (_label, bad) => {
      const saved = { ...savedWith(fp), ...bad } as unknown as SavedState;
      expect(shouldRestore(saved, fp, 'auto')).toBe(false);
    });

    it('warns so a corrupt record is distinguishable from a first launch', () => {
      const saved = { ...savedWith(fp), q: null } as unknown as SavedState;
      shouldRestore(saved, fp, 'auto');
      expect(console.warn).toHaveBeenCalled();
    });
  });

  // restoreState() skips a null optional, so rejecting the whole document
  // would drop the bookmark, quiz scores and duration that are still intact.
  it.each([
    ['c is null', { c: null }],
    ['s is null', { s: null }],
    ['gs is null', { gs: null }],
    ['qa is null', { qa: null }],
  ])('restores a saved document where %s', (_label, nulled) => {
    const saved = { ...savedWith(fp), ...nulled } as unknown as SavedState;
    expect(shouldRestore(saved, fp, 'auto')).toBe(true);
  });
});
