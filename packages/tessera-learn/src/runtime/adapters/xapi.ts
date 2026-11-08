import { BaseXAPILaunchAdapter } from './xapi-launch-base.js';
import { STANDARDS, XAPI_COURSE_TYPE } from '../standards.js';
import type { CourseConfig } from '../types.js';

/**
 * Plain xAPI ("Tin Can") launch adapter. Reads launch params straight off the
 * URL, with no cmi5 fetch-token, LMS.LaunchData or cmi5 context.
 */
export class XAPIAdapter extends BaseXAPILaunchAdapter {
  protected readonly logName = 'xAPI';
  protected readonly profile = STANDARDS.xapi;
  // Tin Can uses snake_case `activity_id` (NOT cmi5's camelCase `activityId`).
  protected readonly activityIdParam = 'activity_id';
  protected readonly authParam = 'auth';
  protected readonly credentialLabel =
    "credential from launch parameter 'auth'";

  /** The course definition tincan.xml declares, for an LRS that never reads the package. */
  readonly #activityDefinition: Record<string, unknown>;

  constructor(config: CourseConfig) {
    super(config);
    this.#activityDefinition = {
      type: XAPI_COURSE_TYPE,
      name: { [this.lang]: config.title },
      ...(config.description && {
        description: { [this.lang]: config.description },
      }),
    };
  }

  protected async resolveAuth(auth: string): Promise<string> {
    // Tin Can launch passes `auth` as the full "Basic <base64>" header value;
    // strip the scheme so we don't double-prefix it when sending.
    return auth.replace(/^Basic(\s+|$)/i, '');
  }

  protected override async prepareLaunch() {
    return { activityDefinition: this.#activityDefinition };
  }
}
