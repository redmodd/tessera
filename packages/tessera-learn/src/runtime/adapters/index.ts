import type { CourseConfig } from '../types.js';
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

export class LMSAdapterError extends Error {
  standard: 'scorm12' | 'scorm2004' | 'cmi5' | 'xapi';
  constructor(
    standard: 'scorm12' | 'scorm2004' | 'cmi5' | 'xapi',
    message: string,
  ) {
    super(message);
    this.name = 'LMSAdapterError';
    this.standard = standard;
  }
}

export interface CreateAdapterOptions {
  /**
   * When true, a missing LMS API falls back to `WebAdapter` with a console
   * warning instead of throwing. Defaults to Vite's `import.meta.env.DEV`,
   * so dev builds stay forgiving and production builds fail loud.
   */
  allowFallback?: boolean;
}

type LMSStandard = 'scorm12' | 'scorm2004' | 'cmi5' | 'xapi';

/** Per-standard LMS wiring: `detect` returns an adapter when the LMS runtime is reachable, else null. Labels are the single source for the dev warning and production error. */
const LMS_ADAPTERS: Record<
  LMSStandard,
  {
    detect: () => PersistenceAdapter | null;
    warnLabel: string;
    name: string;
    missingDetail: string;
  }
> = {
  scorm12: {
    detect: () => {
      const api = findSCORM12API();
      return api ? new SCORM12Adapter(api) : null;
    },
    warnLabel: 'SCORM 1.2 API',
    name: 'SCORM 1.2',
    missingDetail:
      'No SCORM 1.2 API object found in the window.parent or window.opener chain.',
  },
  scorm2004: {
    detect: () => {
      const api = findSCORM2004API();
      return api ? new SCORM2004Adapter(api) : null;
    },
    warnLabel: 'SCORM 2004 API',
    name: 'SCORM 2004',
    missingDetail:
      'No SCORM 2004 API object found in the window.parent or window.opener chain.',
  },
  cmi5: {
    detect: () => (hasCMI5LaunchParams() ? new CMI5Adapter() : null),
    warnLabel: 'cmi5 launch parameters',
    name: 'cmi5',
    missingDetail:
      'No cmi5 launch parameters (fetch / endpoint / activityId / actor) on the URL.',
  },
  xapi: {
    detect: () => (hasXAPILaunchParams() ? new XAPIAdapter() : null),
    warnLabel: 'xAPI launch parameters',
    name: 'xAPI 1.0.3',
    missingDetail:
      'No xAPI launch parameters (endpoint / auth / actor / activity_id) on the URL.',
  },
};

function missingApiError(standard: LMSStandard): LMSAdapterError {
  const { name, missingDetail } = LMS_ADAPTERS[standard];
  return new LMSAdapterError(
    standard,
    `Tessera: this course is configured for ${name} but ${missingDetail} ` +
      `The course must be launched from an LMS that provides the ${name} runtime. ` +
      `If you are testing locally, run \`npm run dev\` instead, or set export.standard to "web".`,
  );
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
  options: CreateAdapterOptions = {},
): PersistenceAdapter {
  const allowFallback = options.allowFallback ?? import.meta.env?.DEV === true;
  const standard = config.export?.standard;
  if (
    standard === 'scorm12' ||
    standard === 'scorm2004' ||
    standard === 'cmi5' ||
    standard === 'xapi'
  ) {
    const entry = LMS_ADAPTERS[standard];
    const adapter = entry.detect();
    if (adapter) return adapter;
    if (!allowFallback) throw missingApiError(standard);
    console.warn(
      `Tessera (dev): ${entry.warnLabel} not found — falling back to localStorage`,
    );
  }
  return new WebAdapter(config);
}
