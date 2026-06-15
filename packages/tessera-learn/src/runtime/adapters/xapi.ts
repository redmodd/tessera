import { BaseXAPILaunchAdapter } from './xapi-launch-base.js';

/**
 * Plain xAPI ("Tin Can") launch adapter. Reads launch params straight off the
 * URL — no cmi5 fetch-token, no LMS.LaunchData, no cmi5 context. Construct with
 * the xAPI version to declare on the wire ('1.0.3' or '2.0.0').
 */
export class XAPIAdapter extends BaseXAPILaunchAdapter {
  constructor(version: '1.0.3' | '2.0.0') {
    super();
    this.version = version;
  }

  async init(): Promise<void> {
    const params = new URLSearchParams(window.location.search);
    this.endpoint = (params.get('endpoint') || '').replace(/\/?$/, '/');
    // Tin Can uses snake_case `activity_id` (NOT cmi5's camelCase `activityId`).
    this.activityId = params.get('activity_id') || '';
    const reg = params.get('registration') || '';
    this.registration = reg ? reg : undefined;
    // Tin Can launch passes `auth` as the full "Basic <base64>" header value;
    // strip the scheme so we don't double-prefix it when sending.
    this.authToken = (params.get('auth') || '').replace(/^Basic\s+/i, '');
    this.parseActorParam(params.get('actor') || '');

    const publisher = this.createPublisher({});
    await publisher.init();

    this.sendInitialized();
    await this.loadResumeState();
  }
}
