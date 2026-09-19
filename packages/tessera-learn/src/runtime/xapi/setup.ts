import type {
  CourseConfig,
  CourseRuntime,
  XAPIConfig,
  XAPIDestinationHooks,
  XAPIExplicitConfig,
} from '../types.js';
import type { PersistenceAdapter } from '../persistence.js';
import type { XAPIAgent } from './types.js';
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
 * Throws synchronously when `endpoint: 'lms'` appears under cmi5 or plain
 * xAPI export but the runtime was constructed without launch parameters
 * (i.e., running locally outside an LMS). Surfaced through every
 * `sendStatement` call rather than silently no-oping — the alternative
 * produces the "works in dev, silently broken in prod" footgun.
 */
class XAPIDevFallbackError extends Error {
  constructor(standard: LaunchLRSStandard) {
    super(
      `Tessera xAPI: xapi.endpoint is 'lms' but ${STANDARDS[standard].missingDetail} ` +
        'Either launch this course from a real LMS / SCORM Cloud, or ' +
        'temporarily change xapi.endpoint to an explicit URL pointed at a ' +
        'local LRS (e.g. http://localhost:8080/data/xAPI/) for dev work.',
    );
    this.name = 'XAPIDevFallbackError';
  }
}

/**
 * Build a stub publisher whose sends reject with the supplied error. Used for
 * both dev-fallback paths: cmi5/xAPI `endpoint: 'lms'` with no launch params, and
 * SCORM explicit endpoints that depend on a learner identity the dev fallback
 * can't synthesize. The placeholder carries a static actor so the constructor
 * invariants hold and `XAPIClient.buildStatement` can run without throwing —
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

function makeDevFallbackPublisher(standard: LaunchLRSStandard): XAPIPublisher {
  return makeRejectingPublisher(() => new XAPIDevFallbackError(standard));
}

class XAPISCORMDevFallbackError extends Error {
  constructor(standard: ActorDerivingStandard) {
    const { name, learnerIdField } = STANDARDS[standard];
    super(
      `Tessera xAPI: ${name} learner identity is unavailable in dev (no LMS API found, ` +
        'falling back to localStorage). The runtime cannot synthesize an actor for this xapi ' +
        'destination. Either set xapi.actor in course.config.js, export an actor resolver ' +
        'for it from course.runtime.js, or launch from ' +
        `a real LMS / SCORM Cloud where ${learnerIdField} is populated.`,
    );
    this.name = 'XAPISCORMDevFallbackError';
  }
}

function makeSCORMDevFallbackPublisher(
  standard: ActorDerivingStandard,
): XAPIPublisher {
  return makeRejectingPublisher(() => new XAPISCORMDevFallbackError(standard));
}

type ActorResolution =
  | { kind: 'actor'; value: XAPIAgent | (() => XAPIAgent | Promise<XAPIAgent>) }
  | { kind: 'scorm-fallback'; standard: ActorDerivingStandard };

/**
 * Resolve a single `XAPIConfig` entry into its publisher: the launch adapter's
 * own (shared queue) for `endpoint: 'lms'`, else a fresh one. Returns null
 * when the entry can't materialize, which includes the supported case of
 * `endpoint: 'lms'` under a non-launch export standard.
 */
function resolveDestination(
  entry: XAPIConfig,
  config: CourseConfig,
  adapter: PersistenceAdapter,
  hooks: CourseRuntime['xapi'],
): XAPIPublisher | null {
  if (entry.endpoint === 'lms') {
    const profile = standardProfile(config.export?.standard);
    if (!profile?.hasLaunchLRS) {
      console.warn(
        "Tessera xAPI: ignoring xapi entry with endpoint: 'lms' under a non-launch export.",
      );
      return null;
    }
    // Only the dev fallback (a WebAdapter, launch params absent) has no launch
    // publisher. Its sends reject so author code surfaces the dev/prod gap.
    return adapter.launchPublisher() ?? makeDevFallbackPublisher(profile.id);
  }

  // Explicit endpoint.
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
  const resolution = resolveExplicitActor(explicit, hook, config, adapter);
  if (resolution === null) return null;
  if (resolution.kind === 'scorm-fallback') {
    return makeSCORMDevFallbackPublisher(resolution.standard);
  }
  return new XAPIPublisher({
    endpoint: explicit.endpoint,
    auth,
    actor: resolution.value,
    activityId: explicit.activityId,
    registration: explicit.registration,
  });
}

/**
 * Pick an actor (object or resolver function) for an explicit destination,
 * applying the priority order: author-supplied (course.runtime.js resolver,
 * then `xapi.actor`) > cmi5 launch actor > SCORM-derived actor > error.
 * Returns null if no actor can be resolved (web export with no actor, which
 * the build-time validator rejects; the publisher is skipped).
 */
function resolveExplicitActor(
  explicit: XAPIExplicitConfig,
  hook: XAPIDestinationHooks | undefined,
  config: CourseConfig,
  adapter: PersistenceAdapter,
): ActorResolution | null {
  const actor = hook?.actor ?? explicit.actor;
  if (actor !== undefined) {
    return { kind: 'actor', value: actor };
  }
  if (adapter.connected) {
    const derived = adapter.deriveActor(
      explicit.activityId,
      explicit.actorAccountHomePage,
    );
    if (derived) return { kind: 'actor', value: derived };
    console.warn(
      'Tessera xAPI: the LMS supplied no learner id for an explicit destination; skipping it.',
    );
    return null;
  }
  const profile = standardProfile(config.export?.standard);
  if (profile?.derivesLearnerActor) {
    return { kind: 'scorm-fallback', standard: profile.id };
  }
  console.warn(
    'Tessera xAPI: explicit destination has no actor and no derivation source — skipping.',
  );
  return null;
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
  adapter: PersistenceAdapter,
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
        'Tessera xAPI: failed to initialize an explicit destination — skipping.',
        err,
      );
    }
  }
  if (publishers.length === 0) return null;
  return new XAPIClient(publishers);
}
