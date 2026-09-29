import type { Manifest } from '../plugin/manifest.js';
import type { SavedState } from './persistence.js';

// Bumped when the SavedState layout changes, so blobs written by an older
// runtime fail the fingerprint gate instead of half-restoring.
const FORMAT_VERSION = '2';

// FNV-1a over the ordered page slugs. SavedState is keyed by page index, so a
// structure change must change the fingerprint — else stale state restores onto
// the wrong pages. Slugs can't contain a NUL, so it's a collision-proof delimiter.
export function structureFingerprint(manifest: Manifest): string {
  const slugs = [FORMAT_VERSION, ...manifest.pages.map((p) => p.slug)].join(
    '\0',
  );
  let h = 0x811c9dc5;
  for (let i = 0; i < slugs.length; i++) {
    h ^= slugs.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isGradedUnit = (value: unknown): boolean =>
  isRecord(value) &&
  (value.q == null || isRecord(value.q)) &&
  (value.w == null || Array.isArray(value.w));

// Rejected whole: a shape restoreFrom() iterates unguarded throws partway
// through and the mutations already applied get written back over the record.
// A null optional is fine, restoreFrom skips it. Bad values in a sound shape,
// the bookmark and duration included, are dropped or repaired on restore.
const isMalformed = (saved: SavedState): boolean =>
  !isRecord(saved) ||
  !Array.isArray(saved.v) ||
  (saved.c != null && !isRecord(saved.c)) ||
  (saved.g != null &&
    (!isRecord(saved.g) || !Object.values(saved.g).every(isGradedUnit)));

// `never` always starts fresh; otherwise a saved fingerprint that no longer
// matches the current structure is discarded.
export function shouldRestore(
  saved: SavedState,
  currentFingerprint: string,
  resume: 'auto' | 'never' = 'auto',
): boolean {
  if (resume === 'never') return false;
  if (saved.f !== currentFingerprint) {
    console.warn(
      'Tessera: discarding resume state saved for a different course structure or runtime version',
    );
    return false;
  }
  if (isMalformed(saved)) {
    console.warn('Tessera: discarding malformed resume state');
    return false;
  }
  return true;
}
