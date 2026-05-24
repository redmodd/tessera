import type { XAPIAgent } from './types.js';
import type { SCORM12API } from '../adapters/scorm12.js';
import type { SCORM2004API } from '../adapters/scorm2004.js';

/**
 * Compute the default SCORM-derived `account.homePage` from the activity
 * IRI. Returns the URL origin when `activityId` is an http(s) URL,
 * otherwise null. Callers that get null and have no `actorAccountHomePage`
 * override should treat it as a config error (the build-time validator
 * already enforces this; this is a runtime fallback for completeness).
 */
export function defaultAccountHomePage(activityId: string): string | null {
  try {
    const url = new URL(activityId);
    if (url.protocol === 'http:' || url.protocol === 'https:') {
      return url.origin;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Synthesize an Identified Agent for SCORM 1.2 from the LMS data model.
 *
 *   { account: { homePage, name: cmi.core.student_id },
 *     name: cmi.core.student_name,
 *     objectType: 'Agent' }
 *
 * The `account` IFI satisfies xAPI's Identified Agent rule. `homePage`
 * defaults to the activityId origin so analytics keyed on actor identity
 * stay stable across LMS hosts; the author's `actorAccountHomePage`
 * overrides when the authority namespace is elsewhere.
 *
 * Returns null if `student_id` is missing — caller should not construct
 * a publisher in that case (the LRS would 400 on every send anyway).
 */
export function synthesizeSCORM12Actor(
  api: SCORM12API,
  activityId: string,
  actorAccountHomePage?: string,
): XAPIAgent | null {
  let id = '';
  let name = '';
  try {
    id = api.LMSGetValue('cmi.core.student_id') || '';
  } catch {}
  try {
    name = api.LMSGetValue('cmi.core.student_name') || '';
  } catch {}
  if (!id) return null;
  const homePage = actorAccountHomePage ?? defaultAccountHomePage(activityId);
  if (!homePage) return null;
  const agent: XAPIAgent = {
    account: { homePage, name: id },
    objectType: 'Agent',
  };
  if (name) agent.name = name;
  return agent;
}

/**
 * Synthesize an Identified Agent for SCORM 2004 from the LMS data model.
 * Same structure as SCORM 1.2 but reads from `cmi.learner_id` /
 * `cmi.learner_name` (the renamed 2004 fields).
 */
export function synthesizeSCORM2004Actor(
  api: SCORM2004API,
  activityId: string,
  actorAccountHomePage?: string,
): XAPIAgent | null {
  let id = '';
  let name = '';
  try {
    id = api.GetValue('cmi.learner_id') || '';
  } catch {}
  try {
    name = api.GetValue('cmi.learner_name') || '';
  } catch {}
  if (!id) return null;
  const homePage = actorAccountHomePage ?? defaultAccountHomePage(activityId);
  if (!homePage) return null;
  const agent: XAPIAgent = {
    account: { homePage, name: id },
    objectType: 'Agent',
  };
  if (name) agent.name = name;
  return agent;
}
