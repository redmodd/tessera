import type { XAPIAgent } from './types.js';
import type { SCORM12API } from '../adapters/scorm12.js';
import type { SCORM2004API } from '../adapters/scorm2004.js';

/**
 * Origin of an http(s) URL, else null. Shared with the config validator, which
 * predicts this result to know when `actorAccountHomePage` becomes required —
 * one helper keeps the two in lockstep.
 */
export function httpOrigin(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
      ? parsed.origin
      : null;
  } catch {
    return null;
  }
}

/**
 * Synthesize an Identified Agent from the SCORM learner fields.
 *
 *   { account: { homePage, name: <id> }, name: <name>, objectType: 'Agent' }
 *
 * The `account` IFI satisfies xAPI's Identified Agent rule. `homePage`
 * defaults to the activityId origin so analytics keyed on actor identity stay
 * stable across LMS hosts; the author's `actorAccountHomePage` overrides when
 * the authority namespace is elsewhere. Returns null if the id is missing —
 * the caller should not construct a publisher (the LRS would 400 every send).
 */
function synthesizeActor(
  readId: () => string,
  readName: () => string,
  activityId: string,
  actorAccountHomePage?: string,
): XAPIAgent | null {
  let id = '';
  let name = '';
  try {
    id = readId() || '';
  } catch {}
  try {
    name = readName() || '';
  } catch {}
  if (!id) return null;
  const homePage = actorAccountHomePage ?? httpOrigin(activityId);
  if (!homePage) return null;
  const agent: XAPIAgent = {
    account: { homePage, name: id },
    objectType: 'Agent',
  };
  if (name) agent.name = name;
  return agent;
}

/** SCORM 1.2 actor from `cmi.core.student_id` / `cmi.core.student_name`. */
export function synthesizeSCORM12Actor(
  api: SCORM12API,
  activityId: string,
  actorAccountHomePage?: string,
): XAPIAgent | null {
  return synthesizeActor(
    () => api.LMSGetValue('cmi.core.student_id'),
    () => api.LMSGetValue('cmi.core.student_name'),
    activityId,
    actorAccountHomePage,
  );
}

/** SCORM 2004 actor from `cmi.learner_id` / `cmi.learner_name` (renamed 2004 fields). */
export function synthesizeSCORM2004Actor(
  api: SCORM2004API,
  activityId: string,
  actorAccountHomePage?: string,
): XAPIAgent | null {
  return synthesizeActor(
    () => api.GetValue('cmi.learner_id'),
    () => api.GetValue('cmi.learner_name'),
    activityId,
    actorAccountHomePage,
  );
}
