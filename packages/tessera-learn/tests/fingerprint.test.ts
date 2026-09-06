import { describe, it, expect } from 'vitest';
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

  it.each([
    ['v is not an array', { v: 'nope' }],
    ['q is null', { q: null }],
    ['q is an array', { q: [] }],
    ['c is not a record', { c: 3 }],
    ['s is not a record', { s: [] }],
    ['gs is not an array', { gs: {} }],
    ['qa is not a record', { qa: 'nope' }],
  ])('discards a saved document where %s', (_label, bad) => {
    const saved = { ...savedWith(fp), ...bad } as unknown as SavedState;
    expect(shouldRestore(saved, fp, 'auto')).toBe(false);
  });
});
