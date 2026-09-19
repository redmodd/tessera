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
  type ActorDerivingStandard,
  type LaunchLRSStandard,
} from '../standards.js';

/**
 * `endpoint: 'lms'` under cmi5 or plain xAPI export with no launch parameters
 * (running locally outside an LMS). Surfaced through every `sendStatement`
 * call rather than silently no-oping, which would work in dev and silently
 * break in prod.
 */
function devFallbackError(standard: LaunchLRSStandard): Error {
  return new Error(
    `Tessera xAPI: xapi.endpoint is 'lms' but ${STANDARDS[standard].missingDetail} ` +
      'Either launch this course from a real LMS / SCORM Cloud, or ' +
      'temporarily change xapi.endpoint to an explicit URL pointed at a ' +
      'local LRS (e.g. http://localhost:8080/data/xAPI/) for dev work.',
  );
}

/**
 * Build a stub publisher whose sends reject with the supplied error. Used for
 * both dev-fallback paths: cmi5/xAPI `endpoint: 'lms'` with no launch params, and
 * SCORM explicit endpoints that depend on a learner identity the dev fallback
 * can't synthesize. The placeholder carries a static actor so the constructor
 * invariants hold and `XAPIClient.buildStatement` can run without throwing;
 * the `unavailableReason` opt makes only the network-bound methods reject.
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

function scormDevFallbackError(standard: ActorDerivingStandard): Error {
  const { name, learnerIdField } = STANDARDS[standard];
  return new Error(
    `Tessera xAPI: ${name} learner identity is unavailable in dev (no LMS API found, ` +
      'falling back to localStorage). The runtime cannot synthesize an actor for this xapi ' +
      'destination. Either set xapi.actor in course.config.js, export an actor resolver ' +
      'for it from course.runtime.js, or launch from ' +
      `a real LMS / SCORM Cloud where ${learnerIdField} is populated.`,
  );
}

/**
 * Resolve a single `XAPIConfig` entry into its publisher: the launch adapter's
 * own (shared queue) for `endpoint: 'lms'`, else a fresh one. Returns null
 * when the entry can't materialize, which includes the supported case of
 * `endpoint: 'lms'` under a non-launch export standard.
 *
 * An explicit destination's actor comes from the author (course.runtime.js
 * resolver, then `xapi.actor`), else the connected adapter (launch actor or
 * SCORM learner fields). Unconnected, a SCORM export gets a rejecting dev
 * publisher; anything else (a web export with no actor, which the build-time
 * validator rejects) is skipped.
 */
function resolveDestination(
  entry: XAPIConfig,
  config: CourseConfig,
  adapter: BaseAdapter,
  hooks: CourseRuntime['xapi'],
): XAPIPublisher | null {
  const profile = standardProfile(config.export?.standard);
  if (entry.endpoint === 'lms') {
    if (!profile?.hasLaunchLRS) {
      console.warn(
        "Tessera xAPI: ignoring xapi entry with endpoint: 'lms' under a non-launch export.",
      );
      return null;
    }
    // Only the dev fallback (a WebAdapter, launch params absent) has no launch
    // publisher. Its sends reject so author code surfaces the dev/prod gap.
    return (
      adapter.launchPublisher() ??
      makeRejectingPublisher(() => devFallbackError(profile.id))
    );
  }

  const explicit = entry as XAPIExplicitConfig;
  const hook = hooks?.[explicit.id];
  const auth = hook?.auth ?? explicit.auth;
  if (auth === undefined) {
    const id = JSON.stringify(explicit.id);
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
    if (!adapter.connected && profile?.derivesLearnerActor) {
      return makeRejectingPublisher(() => scormDevFallbackError(profile.id));
    }
    console.warn(
      adapter.connected
        ? 'Tessera xAPI: the LMS supplied no learner id for an explicit destination; skipping it.'
        : 'Tessera xAPI: explicit destination has no actor and no derivation source; skipping it.',
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
  const publishers: XAPIPublisher[] = [];
  for (const entry of entries) {
    const publisher = resolveDestination(entry, config, adapter, hooks);
    if (!publisher) continue;
    try {
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
