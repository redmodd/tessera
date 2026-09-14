/**
 * The missing-API error, kept free of any adapter imports so both the runtime
 * selector (`createAdapter`) and the build-time generated single-adapter
 * modules can share it without pulling every adapter into a production bundle.
 */

import { STANDARDS, type LMSStandard } from '../standards.js';

export class LMSAdapterError extends Error {
  standard: LMSStandard;
  constructor(standard: LMSStandard, message: string) {
    super(message);
    this.name = 'LMSAdapterError';
    this.standard = standard;
  }
}

export function missingApiError(standard: LMSStandard): LMSAdapterError {
  const { name, missingDetail } = STANDARDS[standard];
  return new LMSAdapterError(
    standard,
    `Tessera: this course is configured for ${name} but ${missingDetail} ` +
      `The course must be launched from an LMS that provides the ${name} runtime. ` +
      `If you are testing locally, run \`npm run dev\` instead, or set export.standard to "web".`,
  );
}
