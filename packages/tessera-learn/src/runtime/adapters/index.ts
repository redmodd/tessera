import type { CourseConfig } from '../types.js';
import type { PersistenceAdapter } from '../persistence.js';
import { WebAdapter } from './web.js';
import { SCORM12Adapter } from './scorm12.js';
import { SCORM2004Adapter } from './scorm2004.js';
import { CMI5Adapter } from './cmi5.js';
import {
  findSCORM12API,
  findSCORM2004API,
  hasCMI5LaunchParams,
} from './discovery.js';

export class LMSAdapterError extends Error {
  standard: 'scorm12' | 'scorm2004' | 'cmi5';
  constructor(standard: 'scorm12' | 'scorm2004' | 'cmi5', message: string) {
    super(message);
    this.name = 'LMSAdapterError';
    this.standard = standard;
  }
}

function missingApiError(
  standard: 'scorm12' | 'scorm2004' | 'cmi5'
): LMSAdapterError {
  const label =
    standard === 'scorm12'
      ? 'SCORM 1.2'
      : standard === 'scorm2004'
        ? 'SCORM 2004'
        : 'cmi5';
  const detail =
    standard === 'cmi5'
      ? 'No cmi5 launch parameters (fetch / endpoint / activityId / actor) on the URL.'
      : `No ${label} API object found in the window.parent or window.opener chain.`;
  return new LMSAdapterError(
    standard,
    `Tessera: this course is configured for ${label} but ${detail} ` +
      `The course must be launched from an LMS that provides the ${label} runtime. ` +
      `If you are testing locally, run \`npm run dev\` instead, or set export.standard to "web".`
  );
}

export interface CreateAdapterOptions {
  /**
   * When true, a missing LMS API falls back to `WebAdapter` with a console
   * warning instead of throwing. Defaults to Vite's `import.meta.env.DEV`,
   * so dev builds stay forgiving and production builds fail loud.
   */
  allowFallback?: boolean;
}

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
type LMSStandard = 'scorm12' | 'scorm2004' | 'cmi5';

/** Per-standard LMS detection. `detect` returns an adapter when the LMS runtime is reachable, else null. */
const LMS_ADAPTERS: Record<LMSStandard, { detect: () => PersistenceAdapter | null; label: string }> = {
  scorm12: {
    detect: () => { const api = findSCORM12API(); return api ? new SCORM12Adapter(api) : null; },
    label: 'SCORM 1.2 API',
  },
  scorm2004: {
    detect: () => { const api = findSCORM2004API(); return api ? new SCORM2004Adapter(api) : null; },
    label: 'SCORM 2004 API',
  },
  cmi5: {
    detect: () => (hasCMI5LaunchParams() ? new CMI5Adapter() : null),
    label: 'cmi5 launch parameters',
  },
};

export function createAdapter(
  config: CourseConfig,
  options: CreateAdapterOptions = {}
): PersistenceAdapter {
  const allowFallback =
    options.allowFallback ?? import.meta.env?.DEV === true;
  const standard = config.export?.standard;
  if (standard === 'scorm12' || standard === 'scorm2004' || standard === 'cmi5') {
    const entry = LMS_ADAPTERS[standard];
    const adapter = entry.detect();
    if (adapter) return adapter;
    if (!allowFallback) throw missingApiError(standard);
    console.warn(
      `Tessera (dev): ${entry.label} not found — falling back to localStorage`
    );
  }
  return new WebAdapter(config);
}
