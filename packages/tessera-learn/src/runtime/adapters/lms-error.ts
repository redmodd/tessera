/**
 * Per-standard LMS labels and the missing-API error, kept free of any adapter
 * imports so both the runtime selector (`createAdapter`) and the build-time
 * generated single-adapter modules can share one source of truth without
 * pulling every adapter into a production bundle.
 */

export type LMSStandard = 'scorm12' | 'scorm2004' | 'cmi5' | 'xapi';

export class LMSAdapterError extends Error {
  standard: LMSStandard;
  constructor(standard: LMSStandard, message: string) {
    super(message);
    this.name = 'LMSAdapterError';
    this.standard = standard;
  }
}

const STANDARD_INFO: Record<
  LMSStandard,
  { name: string; warnLabel: string; missingDetail: string }
> = {
  scorm12: {
    name: 'SCORM 1.2',
    warnLabel: 'SCORM 1.2 API',
    missingDetail:
      'No SCORM 1.2 API object found in the window.parent or window.opener chain.',
  },
  scorm2004: {
    name: 'SCORM 2004',
    warnLabel: 'SCORM 2004 API',
    missingDetail:
      'No SCORM 2004 API object found in the window.parent or window.opener chain.',
  },
  cmi5: {
    name: 'cmi5',
    warnLabel: 'cmi5 launch parameters',
    missingDetail:
      'No cmi5 launch parameters (fetch / endpoint / activityId / actor) on the URL.',
  },
  xapi: {
    name: 'xAPI 1.0.3',
    warnLabel: 'xAPI launch parameters',
    missingDetail:
      'No xAPI launch parameters (endpoint / auth / actor / activity_id) on the URL.',
  },
};

export function lmsWarnLabel(standard: LMSStandard): string {
  return STANDARD_INFO[standard].warnLabel;
}

export function missingApiError(standard: LMSStandard): LMSAdapterError {
  const { name, missingDetail } = STANDARD_INFO[standard];
  return new LMSAdapterError(
    standard,
    `Tessera: this course is configured for ${name} but ${missingDetail} ` +
      `The course must be launched from an LMS that provides the ${name} runtime. ` +
      `If you are testing locally, run \`npm run dev\` instead, or set export.standard to "web".`,
  );
}
