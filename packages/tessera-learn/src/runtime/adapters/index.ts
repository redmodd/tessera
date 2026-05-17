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
export function createAdapter(
  config: CourseConfig,
  options: CreateAdapterOptions = {}
): PersistenceAdapter {
  const allowFallback =
    options.allowFallback ?? import.meta.env?.DEV === true;
  switch (config.export?.standard) {
    case 'scorm12': {
      const api = findSCORM12API();
      if (api) return new SCORM12Adapter(api);
      if (!allowFallback) throw missingApiError('scorm12');
      console.warn(
        'Tessera (dev): SCORM 1.2 API not found — falling back to localStorage'
      );
      return new WebAdapter(config);
    }
    case 'scorm2004': {
      const api = findSCORM2004API();
      if (api) return new SCORM2004Adapter(api);
      if (!allowFallback) throw missingApiError('scorm2004');
      console.warn(
        'Tessera (dev): SCORM 2004 API not found — falling back to localStorage'
      );
      return new WebAdapter(config);
    }
    case 'cmi5': {
      if (hasCMI5LaunchParams()) return new CMI5Adapter();
      if (!allowFallback) throw missingApiError('cmi5');
      console.warn(
        'Tessera (dev): cmi5 launch parameters not found — falling back to localStorage'
      );
      return new WebAdapter(config);
    }
    default:
      return new WebAdapter(config);
  }
}
