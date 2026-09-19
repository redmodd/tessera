import {
  SCORM12_INTERACTION_FORMAT,
  SCORM2004_INTERACTION_FORMAT,
  XAPI_INTERACTION_FORMAT,
  type InteractionFormat,
} from './interaction-format.js';

export const STANDARD_IDS = [
  'web',
  'scorm12',
  'scorm2004',
  'cmi5',
  'xapi',
] as const;

export type StandardId = (typeof STANDARD_IDS)[number];

export const DEFAULT_STANDARD = 'web' satisfies StandardId;

interface ProfileShape {
  id: StandardId;
  name: string;
  packaged: boolean;
  hasLaunchLRS: boolean;
  derivesLearnerActor: boolean;
  warnLabel?: string;
  missingDetail?: string;
  learnerIdField?: string;
  learnerNameField?: string;
  suspendDataLimit?: number;
  interactionFormat?: InteractionFormat;
}

export const STANDARDS = {
  web: {
    id: 'web',
    name: 'Web',
    packaged: false,
    hasLaunchLRS: false,
    derivesLearnerActor: false,
  },
  scorm12: {
    id: 'scorm12',
    name: 'SCORM 1.2',
    packaged: true,
    hasLaunchLRS: false,
    derivesLearnerActor: true,
    warnLabel: 'SCORM 1.2 API',
    missingDetail:
      'no SCORM 1.2 API object found in the window.parent or window.opener chain.',
    learnerIdField: 'cmi.core.student_id',
    learnerNameField: 'cmi.core.student_name',
    suspendDataLimit: 4096,
    interactionFormat: SCORM12_INTERACTION_FORMAT,
  },
  scorm2004: {
    id: 'scorm2004',
    name: 'SCORM 2004',
    packaged: true,
    hasLaunchLRS: false,
    derivesLearnerActor: true,
    warnLabel: 'SCORM 2004 API',
    missingDetail:
      'no SCORM 2004 API object found in the window.parent or window.opener chain.',
    learnerIdField: 'cmi.learner_id',
    learnerNameField: 'cmi.learner_name',
    suspendDataLimit: 64000,
    interactionFormat: SCORM2004_INTERACTION_FORMAT,
  },
  cmi5: {
    id: 'cmi5',
    name: 'cmi5',
    packaged: true,
    hasLaunchLRS: true,
    derivesLearnerActor: false,
    warnLabel: 'cmi5 launch parameters',
    missingDetail:
      'no cmi5 launch parameters (fetch / endpoint / activityId / actor) on the URL.',
    interactionFormat: XAPI_INTERACTION_FORMAT,
  },
  xapi: {
    id: 'xapi',
    name: 'xAPI 1.0.3',
    packaged: true,
    hasLaunchLRS: true,
    derivesLearnerActor: false,
    warnLabel: 'xAPI launch parameters',
    missingDetail:
      'no xAPI launch parameters (endpoint / auth / actor / activity_id) on the URL.',
    interactionFormat: XAPI_INTERACTION_FORMAT,
  },
} as const satisfies { [K in StandardId]: ProfileShape & { id: K } };

export type StandardProfile = (typeof STANDARDS)[StandardId];

type StandardsWhere<F extends keyof StandardProfile> = {
  [K in StandardId]: (typeof STANDARDS)[K][F] extends true ? K : never;
}[StandardId];

export type LMSStandard = StandardsWhere<'packaged'>;
export type LaunchLRSStandard = StandardsWhere<'hasLaunchLRS'>;
export type ActorDerivingStandard = StandardsWhere<'derivesLearnerActor'>;

/** `undefined` for anything outside the table, so callers withhold standard-specific output. */
export function standardProfile(
  id: string | undefined,
): StandardProfile | undefined {
  return id !== undefined && Object.hasOwn(STANDARDS, id)
    ? STANDARDS[id as StandardId]
    : undefined;
}

export function largerSuspendDataStandards(limit: number): StandardId[] {
  return STANDARD_IDS.filter((id) => {
    const profile = STANDARDS[id];
    return (
      profile.packaged &&
      (!('suspendDataLimit' in profile) || profile.suspendDataLimit > limit)
    );
  });
}

/**
 * Origin of an http(s) URL, else null: the default `account.homePage` of a
 * SCORM-derived actor, which the config validator predicts to know when
 * `actorAccountHomePage` becomes required.
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
