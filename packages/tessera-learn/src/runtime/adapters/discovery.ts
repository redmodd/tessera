/**
 * LMS-runtime discovery helpers. Internal to the adapters layer — these
 * decide which `PersistenceAdapter` `createAdapter()` returns for a given
 * `export.standard`. Not part of the public package API.
 */

import { findLMSAPI } from './retry.js';
import type { SCORM12API } from './scorm12.js';
import type { SCORM2004API } from './scorm2004.js';

/**
 * Walk up window.opener and window.parent chain to find the SCORM 1.2 API.
 * Returns null if not found within 10 levels.
 */
export function findSCORM12API(): SCORM12API | null {
  return findLMSAPI('API') as SCORM12API | null;
}

/**
 * Walk up window.opener and window.parent chain to find the SCORM 2004 API.
 * Returns null if not found within 10 levels.
 */
export function findSCORM2004API(): SCORM2004API | null {
  return findLMSAPI('API_1484_11') as SCORM2004API | null;
}

/**
 * Check if CMI5 launch parameters are present in the URL.
 */
export function hasCMI5LaunchParams(): boolean {
  const params = new URLSearchParams(window.location.search);
  return !!(
    params.get('fetch') &&
    params.get('endpoint') &&
    params.get('activityId') &&
    params.get('actor')
  );
}

/** Plain xAPI ("Tin Can") launch params on the URL. No fetch token required; `auth` is the Basic credential the LMS supplies in the launch link. */
export function hasXAPILaunchParams(): boolean {
  const params = new URLSearchParams(window.location.search);
  return !!(
    params.get('endpoint') &&
    params.get('auth') &&
    params.get('actor') &&
    params.get('activity_id')
  );
}
