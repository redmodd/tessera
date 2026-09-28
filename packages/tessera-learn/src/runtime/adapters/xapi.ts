import { BaseXAPILaunchAdapter } from './xapi-launch-base.js';
import { STANDARDS } from '../standards.js';

/**
 * Plain xAPI ("Tin Can") launch adapter. Reads launch params straight off the
 * URL, with no cmi5 fetch-token, LMS.LaunchData or cmi5 context.
 */
export class XAPIAdapter extends BaseXAPILaunchAdapter {
  // Tin Can uses snake_case `activity_id` (NOT cmi5's camelCase `activityId`).
  static override readonly activityIdParam = 'activity_id';
  static readonly launchParams = [
    'endpoint',
    'auth',
    'actor',
    this.activityIdParam,
  ];

  protected readonly logName = 'xAPI';
  protected readonly profile = STANDARDS.xapi;

  protected async resolveAuth(params: URLSearchParams): Promise<string> {
    // Tin Can launch passes `auth` as the full "Basic <base64>" header value;
    // strip the scheme so we don't double-prefix it when sending.
    return (params.get('auth') || '').replace(/^Basic\s+/i, '');
  }
}
