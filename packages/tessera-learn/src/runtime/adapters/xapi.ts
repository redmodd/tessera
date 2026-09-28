import { BaseXAPILaunchAdapter } from './xapi-launch-base.js';

/**
 * Plain xAPI ("Tin Can") launch adapter. Reads launch params straight off the
 * URL, with no cmi5 fetch-token, LMS.LaunchData or cmi5 context.
 */
export class XAPIAdapter extends BaseXAPILaunchAdapter {
  // Tin Can uses snake_case `activity_id` (NOT cmi5's camelCase `activityId`).
  protected readonly activityIdParam = 'activity_id';

  protected async resolveAuth(params: URLSearchParams): Promise<string> {
    // Tin Can launch passes `auth` as the full "Basic <base64>" header value;
    // strip the scheme so we don't double-prefix it when sending.
    return (params.get('auth') || '').replace(/^Basic\s+/i, '');
  }
}
