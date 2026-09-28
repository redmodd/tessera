import {
  BaseXAPILaunchAdapter,
  type LaunchParams,
} from './xapi-launch-base.js';

/**
 * Plain xAPI ("Tin Can") launch adapter. Reads launch params straight off the
 * URL — no cmi5 fetch-token, no LMS.LaunchData, no cmi5 context.
 */
export class XAPIAdapter extends BaseXAPILaunchAdapter {
  protected readLaunchParams(params: URLSearchParams): LaunchParams {
    return {
      endpoint: params.get('endpoint') || '',
      // Tin Can uses snake_case `activity_id` (NOT cmi5's camelCase `activityId`).
      activityId: params.get('activity_id') || '',
      registration: params.get('registration') || '',
    };
  }

  protected async resolveAuth(params: URLSearchParams): Promise<string> {
    // Tin Can launch passes `auth` as the full "Basic <base64>" header value;
    // strip the scheme so we don't double-prefix it when sending.
    return (params.get('auth') || '').replace(/^Basic\s+/i, '');
  }
}
