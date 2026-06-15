import {
  BaseXAPILaunchAdapter,
  warnOnLRSReject,
  VERBS,
} from './xapi-launch-base.js';
import { XAPIPublisher } from '../xapi/publisher.js';
import { uuidv4 } from '../xapi/uuid.js';
import type { XAPIAgent } from '../xapi/types.js';

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

    const rawActor = params.get('actor') || '';
    try {
      const parsed = JSON.parse(rawActor);
      if (!parsed || typeof parsed !== 'object') {
        throw new Error('actor must be an object');
      }
      this.actor = parsed as XAPIAgent;
    } catch (err) {
      throw new Error(
        `Tessera xAPI: launch parameter 'actor' is malformed (${err instanceof Error ? err.message : String(err)}). The LMS did not send a valid Identified Agent JSON.`,
        { cause: err },
      );
    }

    this.publisher = new XAPIPublisher({
      endpoint: this.endpoint,
      auth: this.authToken,
      actor: this.actor,
      activityId: this.activityId,
      registration: this.registration,
      sessionId: uuidv4(),
      version: this.version,
    });
    await this.publisher.init();

    this.publisher
      .sendStatement({
        verb: { id: VERBS.initialized, display: { 'en-US': 'initialized' } },
        context: this.buildContext(),
      })
      .then(warnOnLRSReject('Initialized'))
      .catch((err) => {
        console.warn('Tessera xAPI: failed to send Initialized statement', err);
      });

    await this.loadResumeState();
  }
}
