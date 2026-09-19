import type {
  CourseConfig,
  CourseRuntime,
  XAPIConfig,
  XAPIExplicitConfig,
} from '../types.js';
import type { BaseAdapter } from '../adapters/base.js';
import { XAPIPublisher } from './publisher.js';
import { XAPIClient } from './client.js';
import { XAPIConfigError } from './validation.js';
import {
  STANDARDS,
  standardProfile,
  type LMSStandard,
  type StandardProfile,
} from '../standards.js';

/**
 * A packaged export on the dev fallback (no LMS API or launch parameters) has
 * no launch LRS and no learner to derive an actor from. Its destinations
 * reject every send with this rather than being skipped, so the gap surfaces
 * in dev instead of the destination silently vanishing there.
 */
function devFallbackError(standard: LMSStandard): Error {
  return new Error(
    `Tessera xAPI: ${STANDARDS[standard].missingDetail} ` +
      'Launch this course from a real LMS / SCORM Cloud, or for dev work give ' +
      'this xapi destination an explicit endpoint (e.g. a local LRS at ' +
      'http://localhost:8080/data/xAPI/) and an actor, via xapi.actor or a ' +
      'course.runtime.js resolver.',
  );
}

/**
 * Build a stub publisher whose sends reject with the supplied error, for an
 * explicit destination with no auth and for the dev fallback. The placeholder
 * carries a static actor so the constructor invariants hold and
 * `XAPIClient.buildStatement` can run without throwing; the
 * `unavailableReason` opt makes only the network-bound methods reject.
 */
function makeRejectingPublisher(error: () => Error): XAPIPublisher {
  return new XAPIPublisher({
    endpoint: 'http://localhost/__tessera_dev_fallback__/',
    auth: '',
    actor: { mbox: 'mailto:nobody@example.invalid', objectType: 'Agent' },
    activityId: 'http://localhost/__tessera_dev_fallback__',
    unavailableReason: error,
  });
}

/**
 * Resolve a single `XAPIConfig` entry into its publisher: the launch adapter's
 * own (shared queue) for `endpoint: 'lms'`, else a fresh one. Returns null
 * when the entry can't materialize, which includes the supported case of
 * `endpoint: 'lms'` under a non-launch export standard.
 *
 * An explicit destination's actor comes from the author (course.runtime.js
 * resolver, then `xapi.actor`), else the connected adapter (launch actor or
 * SCORM learner fields). Without one, a packaged export on the dev fallback
 * gets a rejecting publisher; anything else is skipped.
 */
function resolveDestination(
  entry: XAPIConfig,
  profile: StandardProfile | undefined,
  adapter: BaseAdapter,
  hooks: CourseRuntime['xapi'],
): XAPIPublisher | null {
  if (entry.endpoint === 'lms') {
    if (!profile?.hasLaunchLRS) {
      console.warn(
        "Tessera xAPI: ignoring xapi entry with endpoint: 'lms' under a non-launch export.",
      );
      return null;
    }
    // Only the dev fallback (a WebAdapter, launch params absent) has no launch
    // publisher.
    return (
      adapter.launchPublisher() ??
      makeRejectingPublisher(() => devFallbackError(profile.id))
    );
  }

  const explicit = entry as XAPIExplicitConfig;
  const id = JSON.stringify(explicit.id);
  const hook = hooks?.[explicit.id];
  const auth = hook?.auth ?? explicit.auth;
  if (auth === undefined) {
    return makeRejectingPublisher(
      () =>
        new XAPIConfigError(
          `Tessera xAPI: destination ${id} has no auth. Set its auth in course.config.js, ` +
            `or export xapi[${id}].auth from course.runtime.js.`,
        ),
    );
  }

  const actor =
    hook?.actor ??
    explicit.actor ??
    adapter.deriveActor(explicit.activityId, explicit.actorAccountHomePage);
  if (!actor) {
    if (!adapter.connected && profile?.packaged) {
      return makeRejectingPublisher(() => devFallbackError(profile.id));
    }
    console.warn(
      `Tessera xAPI: destination ${id} has no actor and the LMS supplied none to derive (no learner id, or an activityId that is not http(s) with actorAccountHomePage unset); skipping it.`,
    );
    return null;
  }

  return new XAPIPublisher({
    endpoint: explicit.endpoint,
    auth,
    actor,
    activityId: explicit.activityId,
    registration: explicit.registration,
  });
}

/**
 * Construct an `XAPIClient` from a course's `config.xapi` and the
 * `course.runtime.js` resolvers keyed by destination id. Returns null
 * when xapi is unset, or when no destinations could be resolved.
 *
 * The returned client must have `init()` awaited before being registered
 * so author code calling `useXAPI()` sees a fully initialized client
 * (in particular, `getActor()` is safe to call sync).
 */
export async function buildXAPIClient(
  config: CourseConfig,
  adapter: BaseAdapter,
  hooks?: CourseRuntime['xapi'],
): Promise<XAPIClient | null> {
  const raw = config.xapi;
  if (raw === undefined || raw === null) return null;
  const entries: XAPIConfig[] = Array.isArray(raw) ? raw : [raw];
  const profile = standardProfile(config.export?.standard);
  const publishers: XAPIPublisher[] = [];
  for (const entry of entries) {
    try {
      const publisher = resolveDestination(entry, profile, adapter, hooks);
      if (!publisher) continue;
      await publisher.init();
      publishers.push(publisher);
    } catch (err) {
      console.warn(
        'Tessera xAPI: failed to initialize a destination; skipping it.',
        err,
      );
    }
  }
  if (publishers.length === 0) return null;
  return new XAPIClient(publishers);
}
