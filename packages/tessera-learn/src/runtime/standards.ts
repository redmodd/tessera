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
  needsCourseIdentity: boolean;
  sanitizesInteractionIds: boolean;
  warnLabel?: string;
  missingDetail?: string;
  learnerIdField?: string;
  suspendDataLimit?: number;
}

type ProfileFlag =
  | 'packaged'
  | 'hasLaunchLRS'
  | 'derivesLearnerActor'
  | 'needsCourseIdentity'
  | 'sanitizesInteractionIds';

export const STANDARDS = {
  web: {
    id: 'web',
    name: 'Web',
    packaged: false,
    hasLaunchLRS: false,
    derivesLearnerActor: false,
    needsCourseIdentity: true,
    sanitizesInteractionIds: false,
  },
  scorm12: {
    id: 'scorm12',
    name: 'SCORM 1.2',
    packaged: true,
    hasLaunchLRS: false,
    derivesLearnerActor: true,
    needsCourseIdentity: false,
    sanitizesInteractionIds: true,
    warnLabel: 'SCORM 1.2 API',
    missingDetail:
      'no SCORM 1.2 API object found in the window.parent or window.opener chain.',
    learnerIdField: 'cmi.core.student_id',
    suspendDataLimit: 4096,
  },
  scorm2004: {
    id: 'scorm2004',
    name: 'SCORM 2004',
    packaged: true,
    hasLaunchLRS: false,
    derivesLearnerActor: true,
    needsCourseIdentity: false,
    sanitizesInteractionIds: false,
    warnLabel: 'SCORM 2004 API',
    missingDetail:
      'no SCORM 2004 API object found in the window.parent or window.opener chain.',
    learnerIdField: 'cmi.learner_id',
    suspendDataLimit: 64000,
  },
  cmi5: {
    id: 'cmi5',
    name: 'cmi5',
    packaged: true,
    hasLaunchLRS: true,
    derivesLearnerActor: false,
    needsCourseIdentity: true,
    sanitizesInteractionIds: false,
    warnLabel: 'cmi5 launch parameters',
    missingDetail:
      'no cmi5 launch parameters (fetch / endpoint / activityId / actor) on the URL.',
  },
  xapi: {
    id: 'xapi',
    name: 'xAPI 1.0.3',
    packaged: true,
    hasLaunchLRS: true,
    derivesLearnerActor: false,
    needsCourseIdentity: true,
    sanitizesInteractionIds: false,
    warnLabel: 'xAPI launch parameters',
    missingDetail:
      'no xAPI launch parameters (endpoint / auth / actor / activity_id) on the URL.',
  },
} as const satisfies { [K in StandardId]: ProfileShape & { id: K } };

export type StandardProfile = (typeof STANDARDS)[StandardId];

type StandardsWhere<F extends ProfileFlag> = {
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
    const profile: ProfileShape = STANDARDS[id];
    return profile.packaged && (profile.suspendDataLimit ?? Infinity) > limit;
  });
}
