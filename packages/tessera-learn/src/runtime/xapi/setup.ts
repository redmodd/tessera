import type { CourseConfig, XAPIConfig, XAPIExplicitConfig } from '../types.js';
import type { PersistenceAdapter } from '../persistence.js';
import type { XAPIAgent } from './types.js';
import { XAPIPublisher } from './publisher.js';
import { XAPIClient } from './client.js';
import {
  synthesizeSCORM12Actor,
  synthesizeSCORM2004Actor,
} from './derive-actor.js';
import { BaseXAPILaunchAdapter } from '../adapters/xapi-launch-base.js';
import { SCORM12Adapter } from '../adapters/scorm12.js';
import { SCORM2004Adapter } from '../adapters/scorm2004.js';

/**
 * Wraps a value that the runtime knows how to materialize into an
 * `XAPIPublisher`. Either a fresh publisher constructed for an explicit
 * destination, or a reference to a launch adapter's existing publisher
 * (for the `endpoint: 'lms'` sentinel — same instance, shared queue). Both
 * the cmi5 and plain-xAPI adapters expose that publisher via the base.
 */
type DestinationSource =
  | { kind: 'lms-shared'; adapter: BaseXAPILaunchAdapter }
  | { kind: 'explicit'; publisher: XAPIPublisher };

/**
 * Throws synchronously when `endpoint: 'lms'` appears under cmi5 export
 * but the runtime was constructed without cmi5 launch parameters (i.e.,
 * running locally outside an LMS). Surfaced through every
 * `sendStatement` call rather than silently no-oping — the alternative
 * produces the "works in dev, silently broken in prod" footgun.
 */
class XAPIDevFallbackError extends Error {
  constructor(standard: 'cmi5' | 'xapi') {
    const missing =
      standard === 'cmi5'
        ? 'cmi5 launch parameters (fetch / endpoint / activityId / actor)'
        : 'xAPI launch parameters (endpoint / auth / actor / activity_id)';
    super(
      `Tessera xAPI: xapi.endpoint is 'lms' but no ${missing} were present on the URL. ` +
        'Either launch this course from a real LMS / SCORM Cloud, or ' +
        'temporarily change xapi.endpoint to an explicit URL pointed at a ' +
        'local LRS (e.g. http://localhost:8080/data/xAPI/) for dev work.',
    );
    this.name = 'XAPIDevFallbackError';
  }
}

/**
 * Build a stub publisher whose sends reject with the supplied error. Used for
 * both dev-fallback paths: cmi5 `endpoint: 'lms'` with no launch params, and
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

function makeDevFallbackPublisher(standard: 'cmi5' | 'xapi'): XAPIPublisher {
  return makeRejectingPublisher(() => new XAPIDevFallbackError(standard));
}

class XAPISCORMDevFallbackError extends Error {
  constructor(standard: 'scorm12' | 'scorm2004') {
    const label = standard === 'scorm12' ? 'SCORM 1.2' : 'SCORM 2004';
    super(
      `Tessera xAPI: ${label} learner identity is unavailable in dev (no LMS API found, ` +
        'falling back to localStorage). The runtime cannot synthesize an actor for this xapi ' +
        'destination. Either supply xapi.actor explicitly in course.config.js, or launch from ' +
        'a real LMS / SCORM Cloud where ' +
        (standard === 'scorm12' ? 'cmi.core.student_id' : 'cmi.learner_id') +
        ' is populated.',
    );
    this.name = 'XAPISCORMDevFallbackError';
  }
}

function makeSCORMDevFallbackPublisher(
  standard: 'scorm12' | 'scorm2004',
): XAPIPublisher {
  return makeRejectingPublisher(() => new XAPISCORMDevFallbackError(standard));
}

type ActorResolution =
  | { kind: 'actor'; value: XAPIAgent | (() => XAPIAgent | Promise<XAPIAgent>) }
  | { kind: 'scorm-fallback'; standard: 'scorm12' | 'scorm2004' };

/**
 * Resolve a single `XAPIConfig` entry into a destination source. Returns null
 * when the entry can't materialize, which includes the supported case of
 * `endpoint: 'lms'` under a non-launch export standard.
 */
function resolveDestination(
  entry: XAPIConfig,
  config: CourseConfig,
  adapter: PersistenceAdapter | null,
): DestinationSource | null {
  if (entry.endpoint === 'lms') {
    const standard = config.export?.standard;
    if (standard !== 'cmi5' && standard !== 'xapi') {
      console.warn(
        "Tessera xAPI: ignoring xapi entry with endpoint: 'lms' under a non-launch export.",
      );
      return null;
    }
    if (adapter instanceof BaseXAPILaunchAdapter) {
      return { kind: 'lms-shared', adapter };
    }
    // Dev fallback — launch params absent, adapter is the WebAdapter
    // fallback. Materialize a publisher whose sends reject with an
    // explicit error so author code surfaces the dev/prod gap.
    return { kind: 'explicit', publisher: makeDevFallbackPublisher(standard) };
  }

  // Explicit endpoint.
  const explicit = entry as XAPIExplicitConfig;
  const resolution = resolveExplicitActor(explicit, config, adapter);
  if (resolution === null) return null;
  if (resolution.kind === 'scorm-fallback') {
    return {
      kind: 'explicit',
      publisher: makeSCORMDevFallbackPublisher(resolution.standard),
    };
  }
  const publisher = new XAPIPublisher({
    endpoint: explicit.endpoint,
    auth: explicit.auth,
    actor: resolution.value,
    activityId: explicit.activityId,
    registration: explicit.registration,
  });
  return { kind: 'explicit', publisher };
}

/**
 * Pick an actor (object or resolver function) for an explicit destination,
 * applying the priority order: author-supplied > cmi5 launch actor >
 * SCORM-derived actor > error. Returns null if no actor can be resolved
 * (web export with no `xapi.actor` — build-time validator should have
 * caught this; runtime returns null and the publisher is skipped).
 */
function resolveExplicitActor(
  explicit: XAPIExplicitConfig,
  config: CourseConfig,
  adapter: PersistenceAdapter | null,
): ActorResolution | null {
  if (explicit.actor !== undefined) {
    return { kind: 'actor', value: explicit.actor };
  }
  const standard = config.export?.standard;
  if (
    (standard === 'cmi5' || standard === 'xapi') &&
    adapter instanceof BaseXAPILaunchAdapter
  ) {
    const inner = adapter.getPublisher();
    if (!inner) return null;
    try {
      return { kind: 'actor', value: inner.getActor() };
    } catch {
      return null;
    }
  }
  if (config.export?.standard === 'scorm12') {
    if (adapter instanceof SCORM12Adapter) {
      return {
        kind: 'actor',
        value: synthesizeSCORM12Actor(
          adapter.getAPI(),
          explicit.activityId,
          explicit.actorAccountHomePage,
        ) as XAPIAgent,
      };
    }
    return { kind: 'scorm-fallback', standard: 'scorm12' };
  }
  if (config.export?.standard === 'scorm2004') {
    if (adapter instanceof SCORM2004Adapter) {
      return {
        kind: 'actor',
        value: synthesizeSCORM2004Actor(
          adapter.getAPI(),
          explicit.activityId,
          explicit.actorAccountHomePage,
        ) as XAPIAgent,
      };
    }
    return { kind: 'scorm-fallback', standard: 'scorm2004' };
  }
  console.warn(
    'Tessera xAPI: explicit destination has no actor and no derivation source — skipping.',
  );
  return null;
}

/**
 * Construct an `XAPIClient` from a course's `config.xapi`. Returns null
 * when xapi is unset, or when no destinations could be resolved.
 *
 * The returned client must have `init()` awaited before being registered
 * so author code calling `useXAPI()` sees a fully initialized client
 * (in particular, `getActor()` is safe to call sync).
 */
export async function buildXAPIClient(
  config: CourseConfig,
  adapter: PersistenceAdapter | null,
): Promise<XAPIClient | null> {
  const raw = config.xapi;
  if (raw === undefined || raw === null) return null;
  const entries: XAPIConfig[] = Array.isArray(raw) ? raw : [raw];
  const sources: DestinationSource[] = [];
  for (const entry of entries) {
    const src = resolveDestination(entry, config, adapter);
    if (src) sources.push(src);
  }
  if (sources.length === 0) return null;

  // For each destination, get the publisher (either freshly constructed
  // for an explicit entry, or the cmi5 adapter's existing instance for
  // 'lms') and ensure it's initialized.
  const publishers: XAPIPublisher[] = [];
  for (const src of sources) {
    if (src.kind === 'lms-shared') {
      const inner = src.adapter.getPublisher();
      if (inner) publishers.push(inner);
    } else {
      try {
        await src.publisher.init();
        publishers.push(src.publisher);
      } catch (err) {
        console.warn(
          'Tessera xAPI: failed to initialize an explicit destination — skipping.',
          err,
        );
      }
    }
  }
  if (publishers.length === 0) return null;
  return new XAPIClient(publishers);
}
