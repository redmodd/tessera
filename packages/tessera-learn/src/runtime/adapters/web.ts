import type { SavedState } from '../persistence.js';
import type { CourseConfig } from '../types.js';
import { courseIdentity } from '../types.js';
import type { Manifest } from '../../plugin/manifest.js';
import { structureFingerprint } from '../fingerprint.js';
import { BaseAdapter } from './base.js';

/**
 * Web persistence adapter — stores course state in localStorage.
 * Used for standalone web deployments (no LMS).
 */
export class WebAdapter extends BaseAdapter {
  #storageKey: string;
  override readonly connected = false;

  constructor(config: CourseConfig, manifest?: Manifest) {
    super();
    const base = courseIdentity(config) || 'tessera-course';
    // Fingerprint in the key invalidates web resume on a structure change (a
    // changed key misses, so getState() returns null). LMS adapters can't key
    // their storage, so they rely on SavedState.f + shouldRestore instead. Keep
    // both — neither mechanism covers the other's adapters.
    const fp = manifest ? structureFingerprint(manifest) : '';
    this.#storageKey = `tessera-${base}${fp ? `-${fp}` : ''}`;
  }

  async init(): Promise<void> {
    try {
      const raw = localStorage.getItem(this.#storageKey);
      if (raw) {
        this.state = JSON.parse(raw);
      }
    } catch {
      // Corrupted data or localStorage unavailable: start fresh.
    }
  }

  saveState(state: SavedState): void {
    this.state = state;
    try {
      localStorage.setItem(this.#storageKey, JSON.stringify(state));
    } catch {
      // localStorage full or unavailable — silently fail
      console.warn('Tessera: Failed to save state to localStorage');
    }
  }
}
