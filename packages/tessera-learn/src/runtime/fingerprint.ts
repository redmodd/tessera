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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const isNumberRecord = (value: unknown): boolean =>
  isRecord(value) && Object.values(value).every(isNumber);

const isNumberArray = (value: unknown): boolean =>
  Array.isArray(value) && value.every(isNumber);

// Rejected whole: a shape restoreState() iterates unguarded throws partway
// through and the mutations already applied get written back over the record.
// A null optional is fine, restoreState skips it.
const isMalformed = (saved: SavedState): boolean =>
  !isNumber(saved.b) ||
  !isNumber(saved.d) ||
  !isNumberArray(saved.v) ||
  !isNumberRecord(saved.q) ||
  (saved.c != null && !isNumberRecord(saved.c)) ||
  (saved.qa != null && !isNumberRecord(saved.qa)) ||
  (saved.gs != null && !isNumberArray(saved.gs)) ||
  (saved.s != null &&
    (!isRecord(saved.s) || !Object.values(saved.s).every(isNumberRecord)));

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
  if (isMalformed(saved)) {
    console.warn('Tessera: discarding malformed resume state');
    return false;
  }
  return true;
}
