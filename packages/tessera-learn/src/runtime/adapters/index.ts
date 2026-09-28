import type { CourseConfig } from '../types.js';
import type { Manifest } from '../../plugin/manifest.js';
import type { BaseAdapter } from './base.js';
import { WebAdapter } from './web.js';
import { SCORM12Adapter } from './scorm12.js';
import { SCORM2004Adapter } from './scorm2004.js';
import { CMI5Adapter } from './cmi5.js';
import { XAPIAdapter } from './xapi.js';
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

/** `connect()` returns an adapter when the LMS runtime is reachable, else null. */
const LMS_ADAPTERS: Record<LMSStandard, { connect(): BaseAdapter | null }> = {
  scorm12: SCORM12Adapter,
  scorm2004: SCORM2004Adapter,
  cmi5: CMI5Adapter,
  xapi: XAPIAdapter,
};

/**
 * Select the appropriate persistence adapter based on course config.
 *
 * In production builds, a course exported to any packaged standard throws
 * `LMSAdapterError` if the matching LMS runtime isn't reachable. We fail
 * loud so a misconfigured launch is visible immediately rather than
 * silently losing tracking to localStorage.
 *
 * In dev mode, missing APIs warn and fall back to `WebAdapter` so authors
 * can still iterate locally.
 */
export function createAdapter(
  config: CourseConfig,
  options: CreateAdapterOptions = {},
): BaseAdapter {
  const allowFallback = options.allowFallback ?? import.meta.env?.DEV === true;
  const profile = standardProfile(config.export?.standard);
  if (profile?.packaged) {
    const adapter = LMS_ADAPTERS[profile.id].connect();
    if (adapter) return adapter;
    if (!allowFallback) throw missingApiError(profile.id);
    console.warn(
      `Tessera (dev): ${profile.warnLabel} not found — falling back to localStorage`,
    );
  }
  return new WebAdapter(config, options.manifest);
}
