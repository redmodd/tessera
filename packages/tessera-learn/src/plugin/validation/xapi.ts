import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { readSourceFileCached } from '../manifest.js';
import { readCourseRuntimeExports, type RuntimeXAPIHooks } from '../ast.js';
import {
  validateAgent,
  validateAuthCredential,
  isBearerCredential,
  joinFieldError,
} from '../../runtime/xapi/agent-rules.js';
import {
  STANDARDS,
  STANDARD_IDS,
  httpOrigin,
  type StandardProfile,
} from '../../runtime/standards.js';
import { isRecord, type XAPIExplicitConfig } from '../../runtime/types.js';
import {
  describeType,
  formatValue,
  READ_FAILURE_MESSAGES,
  type Diagnostics,
} from './diagnostics.js';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const LAUNCH_INHERITED_FIELDS = [
  'auth',
  'actor',
  'activityId',
  'registration',
  'actorAccountHomePage',
] satisfies (keyof XAPIExplicitConfig)[];

const ACTOR_DERIVING_STANDARDS = STANDARD_IDS.filter(
  (id) => STANDARDS[id].derivesLearnerActor,
).join('/');

type XAPIHookRead = RuntimeXAPIHooks | 'none' | 'unknown';

export function readRuntimeXAPIHooks(
  projectRoot: string,
  d: Diagnostics,
): XAPIHookRead {
  const runtimePath = resolve(projectRoot, 'course.runtime.js');
  if (!existsSync(runtimePath)) return 'none';
  const runtime = readCourseRuntimeExports(readSourceFileCached(runtimePath));
  if (!runtime) {
    d.error(`course.runtime.js: ${READ_FAILURE_MESSAGES['parse-error']}`);
    return 'unknown';
  }
  if (runtime.hasDefaultExport) {
    d.error(
      'course.runtime.js: export default is ignored. Use named exports: `export function canAccess`, `export const xapi`.',
    );
  }
  return runtime.xapi;
}

function hookState(
  hooks: XAPIHookRead,
  id: string | undefined,
  key: 'auth' | 'actor',
): 'yes' | 'no' | 'unknown' {
  if (hooks === 'unknown') return 'unknown';
  if (hooks === 'none' || id === undefined) return 'no';
  const keys = hooks.get(id);
  if (keys === 'unknown') return 'unknown';
  return keys?.has(key) ? 'yes' : 'no';
}

function validateHookIds(
  hooks: XAPIHookRead,
  ids: ReadonlySet<string>,
  d: Diagnostics,
): void {
  if (!(hooks instanceof Map)) return;
  for (const id of hooks.keys()) {
    if (!ids.has(id)) {
      d.error(
        `course.runtime.js: xapi[${JSON.stringify(id)}] matches no explicit xapi destination id in course.config.js`,
      );
    }
  }
}

export function validateXAPIConfig(
  raw: unknown,
  profile: StandardProfile | undefined,
  hooks: XAPIHookRead,
  d: Diagnostics,
): void {
  if (raw === undefined || raw === null) {
    validateHookIds(hooks, new Set(), d);
    return;
  }

  // Normalize to array form. The single-object case is shorthand for a
  // one-element array — same machinery, no special case in the runtime.
  const isList = Array.isArray(raw);
  const entries: unknown[] = isList ? raw : [raw];

  if (isList) {
    if (entries.length === 0) {
      d.error(
        'course.config.js: xapi must contain at least one destination, or be omitted',
      );
      return;
    }
    const endpoints = entries.map((e) =>
      isRecord(e) ? e.endpoint : undefined,
    );
    // At most one 'lms' entry — more than one is never legitimate.
    if (endpoints.filter((ep) => ep === 'lms').length > 1) {
      d.error(
        "course.config.js: xapi has multiple entries with endpoint: 'lms' — only one launch-inherited destination is allowed",
      );
    }
    // Warn on duplicate explicit endpoints.
    const seen = new Map<string, number>();
    for (const ep of endpoints) {
      if (typeof ep === 'string' && ep !== 'lms') {
        seen.set(ep, (seen.get(ep) ?? 0) + 1);
      }
    }
    for (const [ep, count] of seen) {
      if (count > 1) {
        d.warn(
          `course.config.js: xapi has ${count} entries with endpoint "${ep}" — usually a copy-paste mistake; ` +
            'fan-out to the same LRS with different actors/activityIds is supported but uncommon.',
        );
      }
    }
  } else if (!isRecord(raw)) {
    d.error('course.config.js: xapi must be an object or an array of objects');
    return;
  }

  const ids = new Set<string>();
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const label = isList ? `xapi[${i}]` : 'xapi';
    if (!isRecord(entry)) {
      d.error(`course.config.js: ${label} must be an object`);
      continue;
    }
    validateSingleXAPIEntry(entry, label, profile, hooks, ids, d);
  }
  validateHookIds(hooks, ids, d);
}

function validateSingleXAPIEntry(
  entry: Record<string, unknown>,
  label: string,
  profile: StandardProfile | undefined,
  hooks: XAPIHookRead,
  ids: Set<string>,
  d: Diagnostics,
): void {
  const endpoint = entry.endpoint;
  const id = entry.id;
  const validId = typeof id === 'string' && id !== '' ? id : undefined;
  if (endpoint !== 'lms' && validId !== undefined) {
    if (ids.has(validId)) {
      d.error(
        `course.config.js: xapi has more than one destination with id ${formatValue(validId)}; ids must be unique`,
      );
    }
    ids.add(validId);
  }
  if (endpoint === undefined) {
    d.error(`course.config.js: ${label}.endpoint is required`);
    return;
  }
  if (typeof endpoint !== 'string') {
    d.error(`course.config.js: ${label}.endpoint must be a string`);
    return;
  }

  if (endpoint === 'lms') {
    // 'lms' inherits the LRS from the launch — only the launch-based
    // standards (cmi5, plain xAPI) carry one. The runtime drops the entry, so
    // one config can still export to every standard.
    if (profile && !profile.hasLaunchLRS) {
      d.warn(
        `course.config.js: ${label}.endpoint: 'lms' has no launch LRS under export.standard "${profile.id}" — ` +
          'this entry is ignored. Give it an explicit LRS endpoint to send statements from this package.',
      );
    }
    for (const f of LAUNCH_INHERITED_FIELDS) {
      if (entry[f] !== undefined) {
        d.error(
          `course.config.js: ${label}.${f} must be omitted when ${label}.endpoint is 'lms' — it is inherited from the launch.`,
        );
      }
    }
    return;
  }

  if (id === undefined) {
    d.error(
      `course.config.js: ${label}.id is required. course.runtime.js keys its xapi resolvers by it.`,
    );
  } else if (validId === undefined) {
    d.error(`course.config.js: ${label}.id must be a non-empty string`);
  }
  const hookRef =
    validId !== undefined
      ? `xapi[${JSON.stringify(validId)}]`
      : `xapi[<${label}.id>]`;

  // Explicit endpoint — must be an absolute http(s) URL.
  const url = URL.parse(endpoint);
  if (!url) {
    d.error(
      `course.config.js: ${label}.endpoint must be an absolute http(s) URL, got ${formatValue(endpoint)}`,
    );
    return;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    d.error(
      `course.config.js: ${label}.endpoint must use http: or https:, got ${formatValue(url.protocol)}`,
    );
    return;
  }
  if (url.protocol === 'http:' && process.env.NODE_ENV === 'production') {
    d.warn(
      `course.config.js: ${label}.endpoint uses http:; LRS credentials will travel in cleartext. Use https in production.`,
    );
  }
  if (!endpoint.endsWith('/')) {
    d.warn(
      `course.config.js: ${label}.endpoint should end with a slash to avoid concatenation surprises ` +
        `(e.g. 'https://lrs.example.com/xapi/' not 'https://lrs.example.com/xapi'). Runtime normalizes regardless.`,
    );
  }

  // auth: required for explicit endpoints, from the config or a resolver.
  const auth = entry.auth;
  const authHook = hookState(hooks, validId, 'auth');
  if (auth === undefined) {
    if (authHook === 'no') {
      d.error(
        `course.config.js: ${label}.auth is required. Set a credential string, or export ${hookRef}.auth from course.runtime.js.`,
      );
    }
  } else if (typeof auth !== 'string') {
    d.error(
      `course.config.js: ${label}.auth must be a string, got ${describeType(auth)}`,
    );
  } else if (authHook === 'yes') {
    d.error(
      `course.config.js: ${label}.auth is also resolved by ${hookRef}.auth in course.runtime.js. Keep one.`,
    );
  } else {
    const authErr = validateAuthCredential(auth);
    if (authErr) {
      const hint = isBearerCredential(auth)
        ? ` For OAuth, export a ${hookRef}.auth resolver from course.runtime.js that returns a Basic credential.`
        : '';
      d.error(
        `course.config.js: ${joinFieldError(`${label}.auth`, authErr)}${hint}`,
      );
    } else {
      d.warn(
        `course.config.js: ${label}.auth is a static string and will be embedded in the bundle. ` +
          `For production, export a ${hookRef}.auth resolver from course.runtime.js that fetches a short-lived token from a server endpoint.`,
      );
    }
  }

  // activityId — required IRI.
  const activityId = entry.activityId;
  if (activityId === undefined || activityId === '') {
    d.error(`course.config.js: ${label}.activityId is required`);
  } else if (typeof activityId !== 'string') {
    d.error(`course.config.js: ${label}.activityId must be a string`);
  } else if (!URL.canParse(activityId)) {
    // Any absolute IRI: the URL parser accepts uncommon schemes.
    d.error(
      `course.config.js: ${label}.activityId must be an absolute IRI, got ${formatValue(activityId)}`,
    );
  }

  // actor — required under web; optional otherwise.
  const actor = entry.actor;
  const actorHook = hookState(hooks, validId, 'actor');
  if (actor === undefined) {
    if (profile?.packaged === false && actorHook === 'no') {
      d.error(
        `course.config.js: ${label}.actor is required for web export: there is no LMS to derive a learner identity from. ` +
          `Set a static Agent object, or export ${hookRef}.actor from course.runtime.js to resolve one (e.g. from your auth system).`,
      );
    }
  } else if (!isRecord(actor)) {
    d.error(
      `course.config.js: ${label}.actor must be an Agent object, got ${describeType(actor)}`,
    );
  } else if (actorHook === 'yes') {
    d.error(
      `course.config.js: ${label}.actor is also resolved by ${hookRef}.actor in course.runtime.js. Keep one.`,
    );
  } else {
    const err = validateAgent(actor);
    if (err) {
      d.error(`course.config.js: ${joinFieldError(`${label}.actor`, err)}`);
    }
  }

  // actorAccountHomePage — optional, only meaningful under SCORM with no
  // explicit actor.
  const aahp = entry.actorAccountHomePage;
  if (aahp !== undefined) {
    if (typeof aahp !== 'string') {
      d.error(
        `course.config.js: ${label}.actorAccountHomePage must be a string`,
      );
    } else if (!URL.canParse(aahp)) {
      d.error(
        `course.config.js: ${label}.actorAccountHomePage must be an absolute URL`,
      );
    }
    if (actor !== undefined || actorHook === 'yes') {
      d.warn(
        `course.config.js: ${label}.actorAccountHomePage is ignored when ${label}.actor is supplied explicitly.`,
      );
    }
    if (profile && !profile.derivesLearnerActor) {
      d.warn(
        `course.config.js: ${label}.actorAccountHomePage is only used under ${ACTOR_DERIVING_STANDARDS} actor synthesis; ignored under "${profile.id}".`,
      );
    }
  }

  // SCORM with auto-derived actor and a non-http(s) activityId:
  // actorAccountHomePage becomes required.
  if (
    actor === undefined &&
    actorHook === 'no' &&
    profile?.derivesLearnerActor &&
    typeof activityId === 'string' &&
    httpOrigin(activityId) === null &&
    aahp === undefined
  ) {
    d.error(
      `course.config.js: ${label}.activityId is not an http(s) URL, so its origin can't be used as the SCORM actor's account.homePage. ` +
        `Provide ${label}.actorAccountHomePage explicitly.`,
    );
  }

  // registration — optional UUID v4.
  const registration = entry.registration;
  if (registration !== undefined) {
    if (typeof registration !== 'string' || !UUID_RE.test(registration)) {
      d.error(
        `course.config.js: ${label}.registration must be a UUID v4, got ${formatValue(registration)}`,
      );
    }
    if (profile && !profile.hasLaunchLRS) {
      d.warn(
        `course.config.js: ${label}.registration is a cmi5 concept; the LRS will accept it under "${profile.id}" but most analytics tools won't know what to do with it.`,
      );
    }
  }
}
