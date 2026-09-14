import type { CourseConfig } from '../types.js';
import type { Manifest } from '../../plugin/manifest.js';
import type { PersistenceAdapter } from '../persistence.js';
import { WebAdapter } from './web.js';
import { SCORM12Adapter } from './scorm12.js';
import { SCORM2004Adapter } from './scorm2004.js';
import { CMI5Adapter } from './cmi5.js';
import { XAPIAdapter } from './xapi.js';
import {
  findSCORM12API,
  findSCORM2004API,
  hasCMI5LaunchParams,
  hasXAPILaunchParams,
} from './discovery.js';
import { LMSAdapterError, missingApiError } from './lms-error.js';
import { standardProfile, type LMSStandard } from '../standards.js';

export { LMSAdapterError, missingApiError };

export interface CreateAdapterOptions {
  /**
   * When true, a missing LMS API falls back to `WebAdapter` with a console
   * warning instead of throwing. Defaults to Vite's `import.meta.env.DEV`,
   * so dev builds stay forgiving and production builds fail loud.
   */
  allowFallback?: boolean;
  /** Course manifest — lets the WebAdapter fingerprint its page structure into the storage key. */
  manifest?: Manifest;
}

/** Per-standard LMS wiring: `detect` returns an adapter when the LMS runtime is reachable, else null. Labels live in `../standards.js`, the fail-loud error in `./lms-error.js`. */
const LMS_ADAPTERS: Record<LMSStandard, () => PersistenceAdapter | null> = {
  scorm12: () => {
    const api = findSCORM12API();
    return api ? new SCORM12Adapter(api) : null;
  },
  scorm2004: () => {
    const api = findSCORM2004API();
    return api ? new SCORM2004Adapter(api) : null;
  },
  cmi5: () => (hasCMI5LaunchParams() ? new CMI5Adapter() : null),
  xapi: () => (hasXAPILaunchParams() ? new XAPIAdapter() : null),
};

/**
 * Select the appropriate persistence adapter based on course config.
 *
 * In production builds, an LMS-configured course (scorm12/scorm2004/cmi5)
 * will throw `LMSAdapterError` if the matching LMS API isn't reachable —
 * we fail loud so a misconfigured launch is visible immediately rather
 * than silently losing tracking to localStorage.
 *
 * In dev mode, missing APIs warn and fall back to `WebAdapter` so authors
 * can still iterate locally.
 */
export function createAdapter(
  config: CourseConfig,
  options: CreateAdapterOptions = {},
): PersistenceAdapter {
  const allowFallback = options.allowFallback ?? import.meta.env?.DEV === true;
  const profile = standardProfile(config.export?.standard);
  if (profile?.packaged) {
    const adapter = LMS_ADAPTERS[profile.id]();
    if (adapter) return adapter;
    if (!allowFallback) throw missingApiError(profile.id);
    console.warn(
      `Tessera (dev): ${profile.warnLabel} not found — falling back to localStorage`,
    );
  }
  return new WebAdapter(config, options.manifest);
}
