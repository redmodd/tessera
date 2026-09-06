import type { Manifest } from '../plugin/manifest.js';
import type { SavedState } from './persistence.js';

// FNV-1a over the ordered page slugs. SavedState is keyed by page index, so a
// structure change must change the fingerprint — else stale state restores onto
// the wrong pages. Slugs can't contain a NUL, so it's a collision-proof delimiter.
export function structureFingerprint(manifest: Manifest): string {
  const slugs = manifest.pages.map((p) => p.slug).join('\0');
  let h = 0x811c9dc5;
  for (let i = 0; i < slugs.length; i++) {
    h ^= slugs.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

const isRecord = (value: unknown): boolean =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

// `never` always starts fresh; otherwise a saved fingerprint that no longer
// matches the current structure is discarded. State saved before fingerprinting
// (no `f`) is trusted so upgrading the runtime never wipes an in-progress learner.
export function shouldRestore(
  saved: SavedState,
  currentFingerprint: string,
  resume: 'auto' | 'never' = 'auto',
): boolean {
  if (resume === 'never') return false;
  if (saved.f !== undefined && saved.f !== currentFingerprint) return false;
  // A document restoreState() would throw partway through is rejected whole:
  // the mutations applied before the throw get written back over the record.
  if (!Array.isArray(saved.v) || !isRecord(saved.q)) return false;
  if (saved.c !== undefined && !isRecord(saved.c)) return false;
  if (saved.s !== undefined && !isRecord(saved.s)) return false;
  if (saved.gs !== undefined && !Array.isArray(saved.gs)) return false;
  if (saved.qa !== undefined && !isRecord(saved.qa)) return false;
  return true;
}
