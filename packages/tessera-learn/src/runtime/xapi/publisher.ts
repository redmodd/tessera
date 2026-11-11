import type {
  XAPIAgent,
  Statement,
  PartialStatement,
  SendStatementOptions,
  XAPIContext,
  XAPIObject,
  SendStatementResult,
  DestinationOutcome,
} from './types.js';
import { uuidv4 } from './uuid.js';
import { X_API_VERSION } from './version.js';
import {
  validatePartialStatement,
  validateAgent,
  validateAuthCredential,
  joinFieldError,
  XAPIConfigError,
} from './validation.js';
import { RETRY_ATTEMPTS, backoffMs } from '../adapters/retry.js';
import { httpOrigin } from '../standards.js';
import { isRecord } from '../types.js';
import { errorMessage, toError } from '../errors.js';

/** cmi5 §9.6.3.1: the cmi5 session id context extension IRI. */
export const CMI5_SESSIONID_EXT =
  'https://w3id.org/xapi/cmi5/context/extensions/sessionid';

export interface XAPIPublisherOptions {
  /** Resolved http(s) endpoint URL. The 'lms' sentinel is a config-layer concept and never reaches the publisher. */
  endpoint: string;
  /**
   * Basic-auth credential (the value after "Basic "), an empty string for
   * unauthenticated requests, or a function that resolves one. Function
   * form is re-invoked once on 401 to cover short-lived tokens.
   */
  auth: string | (() => string | Promise<string>);
  /**
   * Identified Agent (or function returning one). Resolved once during
   * `init()` and cached for the publisher's lifetime.
   */
  actor: XAPIAgent | (() => XAPIAgent | Promise<XAPIAgent>);
  /** xAPI activity IRI scoped to this destination. */
  activityId: string;
  /** Definition sent with the activity when a statement's object defaults to it. */
  activityDefinition?: Record<string, unknown>;
  /** Optional UUID — primarily a cmi5 launch concept. */
  registration?: string;
  /** Optional caller-supplied session id. cmi5 adapter supplies its own. */
  sessionId?: string;
  /**
   * When true, every statement carries the cmi5 sessionid context extension.
   * Set by the cmi5 adapter.
   */
  cmi5Mode?: boolean;
  /** cmi5 §10.2.1: the LMS `contextTemplate` every statement's context starts from. */
  contextTemplate?: XAPIContext;
  /** When set, every send method rejects with the returned Error without hitting the network. */
  unavailableReason?: () => Error;
}

interface UnsentEntry {
  body: Statement | Statement[];
  settle: (o: DestinationOutcome) => void;
  taken: boolean;
}

interface SendOutcome {
  ok: boolean;
  status?: number;
  error?: Error;
}

/**
 * Soft cap on the number of in-flight statements queued behind the head of
 * the chain. We log a one-time warning when the queue grows past this so
 * tight-loop senders can't silently retain every prior `Statement` in the
 * promise chain's closure. Hitting the saturation cap rejects further
 * sends — the publisher is being driven faster than the LRS can drain.
 */
const QUEUE_DEPTH_WARN = 200;
const QUEUE_DEPTH_SATURATED = 1000;
/**
 * Browsers allow 64 KiB of `keepalive: true` request bodies in flight per
 * page, counted across requests, and reject a keepalive fetch past that
 * before it leaves the browser. Splitting a statement batch to fit isn't
 * safe: statements in a batch are atomic from the LRS's perspective, and a
 * partial send would corrupt ordering against Terminated.
 */
const KEEPALIVE_BODY_LIMIT_BYTES = 64 * 1024;
let keepaliveBytesInFlight = 0;
const encoder = new TextEncoder();
const byteLength = (body: string): number => encoder.encode(body).length;
const fitsKeepalive = (bytes: number): boolean =>
  keepaliveBytesInFlight + bytes <= KEEPALIVE_BODY_LIMIT_BYTES;

/**
 * Runs `fn` with `bytes` counted against the keepalive quota when they fit
 * beside the keepalive requests in flight, so its sends leave them room.
 */
function withKeepaliveHeld(bytes: number, fn: () => void): void {
  const held = fitsKeepalive(bytes) ? bytes : 0;
  keepaliveBytesInFlight += held;
  try {
    fn();
  } finally {
    keepaliveBytesInFlight -= held;
  }
}

/**
 * `fetch`, with `keepalive` when asked and the body fits in what the keepalive
 * requests in flight leave of the browser's quota. A body that does not fit is
 * sent without it, so it can still land if the page stays open. The first
 * caller gets first claim.
 */
export function lrsFetch(
  url: string,
  init: RequestInit & { body?: string },
): Promise<Response> {
  if (!init.keepalive) return fetch(url, init);
  const bytes = byteLength(init.body ?? '');
  if (!fitsKeepalive(bytes)) {
    console.warn(
      `Tessera: a ${bytes}-byte xAPI ${init.method ?? 'GET'} does not fit in ` +
        `the 64 KiB browsers allow keepalive requests in flight ` +
        `(${keepaliveBytesInFlight} bytes in flight), so it is sent without ` +
        `keepalive and is lost if the page closes first.`,
    );
    return fetch(url, { ...init, keepalive: false });
  }
  keepaliveBytesInFlight += bytes;
  const release = () => {
    keepaliveBytesInFlight -= bytes;
  };
  return fetch(url, init).then(
    (response) => {
      // Browsers count the request until its response body ends, not at the headers.
      void response.clone().arrayBuffer().then(release, release);
      return response;
    },
    (err: unknown) => {
      release();
      throw err;
    },
  );
}

const isActivity = (a: unknown): a is { id: string } =>
  isRecord(a) && typeof a.id === 'string';

/** xAPI 1.0.3 §2.4.6.2 allows a single Activity in place of a list; entries without a string id are dropped. */
export function toActivityList(value: unknown): Array<{ id: string }> {
  return [value].flat().filter(isActivity);
}

/** cmi5 §10.2.1: a statement may add to the template's context but never overwrite it. */
function applyTemplate(
  template: XAPIContext,
  ctx: XAPIContext,
  object: XAPIObject,
): XAPIContext {
  const activities: Record<string, Array<{ id: string }>> = {
    ...ctx.contextActivities,
  };
  for (const [key, list] of Object.entries(template.contextActivities ?? {})) {
    const ids = new Set(list.map((a) => a.id));
    const added = [activities[key] ?? []]
      .flat()
      .filter((a) => !(isActivity(a) && ids.has(a.id)));
    activities[key] = [...list, ...added];
  }
  // xAPI §2.4.6: revision and platform are only allowed with an Activity object.
  const { revision: _revision, platform: _platform, ...rest } = template;
  return {
    ...ctx,
    ...((object.objectType ?? 'Activity') === 'Activity' ? template : rest),
    contextActivities: activities,
    extensions: { ...ctx.extensions, ...template.extensions },
  };
}

function isClientError(status: number | undefined): boolean {
  return status !== undefined && status >= 400 && status < 500;
}

/**
 * A 409 means the LRS already holds the statement id. On failure, the error
 * carries the first 500 characters of the LRS body (e.g. "Forbidden cmi5
 * defined statement: ...") or the bare status when the body can't be read.
 * Success stays synchronous so the queue starts the next send without extra
 * microtask hops.
 */
function outcomeOf(resp: Response): SendOutcome | Promise<SendOutcome> {
  if (resp.ok || resp.status === 409) return { ok: true, status: resp.status };
  return resp
    .text()
    .catch(() => '')
    .then((respBody) => ({
      ok: false,
      status: resp.status,
      error: new Error(
        `LRS responded ${resp.status}${respBody ? `: ${respBody.slice(0, 500)}` : ''}`,
      ),
    }));
}

/**
 * Single-destination xAPI publisher. Builds and sends statements with
 * sequential queue ordering, retry on 5xx/network errors, and 401-driven
 * auth re-resolution.
 *
 * The launch adapters construct one for their lifecycle stream (with
 * `cmi5Mode: true` under cmi5). Author-config destinations construct one (or
 * more, fanned out) via the runtime registry.
 */
export class XAPIPublisher {
  readonly #endpoint: string;
  readonly #statementsUrl: string;
  readonly #activityId: string;
  readonly #activityDefinition: Record<string, unknown> | undefined;
  readonly #registration?: string;
  readonly #sessionId: string;
  readonly #cmi5Mode: boolean;
  readonly #contextTemplate: XAPIContext | null;

  // When set, every send method short-circuits with a rejected promise.
  readonly #unavailableReason: (() => Error) | null;

  // Auth — string or resolver. Cached after first resolution.
  readonly #authValue: string | (() => string | Promise<string>);
  #cachedAuth: string | null = null;
  // Once two consecutive 401s are observed (one initial + one re-resolve),
  // auth is marked dead and every subsequent send fails fast without
  // hitting the LRS — the credentials have just been rejected and there
  // is no in-band signal to tell us when they would be accepted again.
  // The flag persists for the lifetime of the publisher; authors who
  // need recovery should reload the runtime.
  #authDead = false;

  // Actor — object or resolver. Resolved during init and cached.
  readonly #actorValue: XAPIAgent | (() => XAPIAgent | Promise<XAPIAgent>);
  #cachedActor: XAPIAgent | null = null;
  /** Why the actor is unusable, so post-init reads report the real cause. */
  #actorError: string | null = null;
  #initPromise: Promise<void> | null = null;

  // Sequential send chain — chains promises so statements arrive at the
  // LRS in the order they were enqueued.
  #queue: Promise<void> = Promise.resolve();
  #queueDepth = 0;
  #queueWarned = false;
  #unloading = false;
  #unsent: UnsentEntry[] = [];
  #closed = false;

  constructor(opts: XAPIPublisherOptions) {
    if (!opts.endpoint || typeof opts.endpoint !== 'string') {
      throw new XAPIConfigError('XAPIPublisher: endpoint is required');
    }
    if (!httpOrigin(opts.endpoint)) {
      throw new XAPIConfigError(
        'XAPIPublisher: endpoint must be an absolute http(s) URL',
      );
    }
    if (!opts.activityId) {
      throw new XAPIConfigError('XAPIPublisher: activityId is required');
    }
    this.#endpoint = opts.endpoint.replace(/\/?$/, '/');
    this.#statementsUrl = `${this.#endpoint}statements`;
    this.#activityId = opts.activityId;
    this.#activityDefinition = opts.activityDefinition;
    this.#registration = opts.registration;
    this.#cmi5Mode = !!opts.cmi5Mode;
    this.#contextTemplate = opts.contextTemplate ?? null;
    this.#authValue = opts.auth;
    this.#actorValue = opts.actor;
    this.#sessionId = opts.sessionId ?? uuidv4();
    this.#unavailableReason = opts.unavailableReason ?? null;

    if (typeof this.#actorValue !== 'function') {
      this.#cachedActor = this.#actorValue;
    }
    // Eagerly cache static auth (including the empty-string sentinel for
    // unauthenticated requests) so the hot send path stays synchronous up
    // to fetch().
    if (typeof this.#authValue !== 'function') {
      this.#cachedAuth = this.#authValue;
    }
  }

  /**
   * Resolve actor (if function-form) and validate it. Idempotent.
   * Throws `XAPIConfigError` if the resolved actor fails the Identified
   * Agent rule. CourseSession awaits init before registering the publisher
   * so by the time `useXAPI()` returns non-null, init is complete.
   */
  init(): Promise<void> {
    if (this.#initPromise) return this.#initPromise;
    this.#initPromise = this.#runInit();
    return this.#initPromise;
  }

  async #runInit(): Promise<void> {
    if (this.#cachedActor === null && typeof this.#actorValue === 'function') {
      let resolved: unknown;
      try {
        resolved = await this.#actorValue();
      } catch (err) {
        throw new XAPIConfigError(
          `xapi.actor resolver threw: ${errorMessage(err)}`,
        );
      }
      const err = validateAgent(resolved);
      if (err) throw this.#rejectActor(joinFieldError('xapi.actor', err));
      this.#cachedActor = resolved as XAPIAgent;
    } else if (this.#cachedActor) {
      const err = validateAgent(this.#cachedActor);
      if (err) {
        this.#cachedActor = null;
        throw this.#rejectActor(joinFieldError('xapi.actor', err));
      }
    } else {
      throw new XAPIConfigError('xapi.actor is required');
    }
    // Validate static auth eagerly. An empty string means unauthenticated, so
    // only non-empty values are run through the Basic/Bearer prefix checks.
    if (typeof this.#authValue === 'string' && this.#authValue.length > 0) {
      const aErr = validateAuthCredential(this.#authValue);
      if (aErr) throw new XAPIConfigError(`xapi.auth: ${aErr}`);
    }
  }

  #rejectActor(message: string): XAPIConfigError {
    this.#actorError = message;
    return new XAPIConfigError(message);
  }

  /** Returns the cached actor. Must be called after `init()` resolves. */
  getActor(): XAPIAgent {
    if (!this.#cachedActor) {
      throw new XAPIConfigError(
        this.#actorError ??
          'XAPIPublisher.getActor() called before init() resolved. Await publisher.init() before reading the actor.',
      );
    }
    return this.#cachedActor;
  }

  getActivityId(): string {
    return this.#activityId;
  }

  getSessionId(): string {
    return this.#sessionId;
  }

  /**
   * Build a fully-formed statement from a partial. Mints a UUID, fills in
   * actor / timestamp / context.registration / context.contextActivities.grouping
   * (unless the activity is already the statement's parent) and (when in cmi5
   * mode) the cmi5 sessionid extension. Caller-supplied
   * `context` keys are preserved and publisher-supplied values fill gaps,
   * except that a cmi5 `contextTemplate`'s values win over the caller's.
   *
   * `opts.id` lets a fan-out wrapper share a single UUID across every
   * destination's statement so all LRSes see the same id (idempotent
   * dedupe works across destinations).
   */
  buildStatement(partial: PartialStatement, opts?: { id?: string }): Statement {
    if (!this.#cachedActor) {
      throw new XAPIConfigError(
        'XAPIPublisher used before init() resolved. Await publisher.init() first.',
      );
    }
    const object = partial.object ?? {
      id: this.#activityId,
      objectType: 'Activity',
      ...(this.#activityDefinition && {
        definition: this.#activityDefinition,
      }),
    };
    const userCtx = partial.context ?? {};
    const activities = { ...userCtx.contextActivities };
    if (
      !activities.grouping &&
      !toActivityList(activities.parent).some((a) => a.id === this.#activityId)
    ) {
      activities.grouping = [{ id: this.#activityId }];
    }
    const ctx: XAPIContext = { ...userCtx, contextActivities: activities };
    const context = this.#contextTemplate
      ? applyTemplate(this.#contextTemplate, ctx, object)
      : ctx;
    if (this.#registration && context.registration === undefined) {
      context.registration = this.#registration;
    }
    if (this.#cmi5Mode) {
      context.extensions = {
        ...(context.extensions ?? {}),
        [CMI5_SESSIONID_EXT]: this.#sessionId,
      };
    }

    const verbName = partial.verb.id.split('/').pop() || partial.verb.id;
    const verb = partial.verb.display
      ? partial.verb
      : { id: partial.verb.id, display: { 'en-US': verbName } };

    const statement: Statement = {
      id: opts?.id ?? uuidv4(),
      actor: this.#cachedActor,
      verb,
      object,
      context,
      timestamp: new Date().toISOString(),
    };
    if (partial.result !== undefined) statement.result = partial.result;
    if (partial.attachments !== undefined)
      statement.attachments = partial.attachments;
    return statement;
  }

  /**
   * Author API. Validates the partial, builds the statement, enqueues it,
   * resolves with the per-destination outcome (single-element since this
   * class is single-destination — the fan-out wrapper combines them).
   *
   * Validation failures (verb.id missing, object.id missing when supplied,
   * score.scaled out of range) reject before any HTTP traffic happens.
   */
  async sendStatement(
    partial: PartialStatement,
    options?: SendStatementOptions & { id?: string },
  ): Promise<SendStatementResult> {
    if (this.#unavailableReason) throw this.#unavailableReason();
    validatePartialStatement(partial);
    const statement = this.buildStatement(partial, { id: options?.id });
    const outcome = await this.enqueueBuilt(statement, options);
    return { statementId: statement.id, statement, destinations: [outcome] };
  }

  /**
   * Enqueue a pre-built statement (or array as a single batch POST) onto
   * the queue. Returns a promise that resolves with the outcome once the
   * send settles. Used by `sendStatement` and by the fan-out client, which
   * builds each destination's statement with a shared id.
   */
  enqueueBuilt(
    statementOrBatch: Statement | Statement[],
    options?: SendStatementOptions,
  ): Promise<DestinationOutcome> {
    if (this.#unavailableReason) {
      return Promise.reject(this.#unavailableReason());
    }
    if (this.#closed) {
      return Promise.resolve(
        this.#toDestination({
          ok: false,
          error: new XAPIConfigError(
            'XAPIPublisher: Terminated was already sent; statement dropped.',
          ),
        }),
      );
    }
    if (this.#queueDepth >= QUEUE_DEPTH_SATURATED) {
      return Promise.resolve(
        this.#toDestination({
          ok: false,
          error: new XAPIConfigError(
            `XAPIPublisher queue saturated (${this.#queueDepth} in-flight); refusing further sends until the LRS catches up.`,
          ),
        }),
      );
    }
    if (!this.#queueWarned && this.#queueDepth >= QUEUE_DEPTH_WARN) {
      this.#queueWarned = true;
      console.warn(
        `Tessera: xAPI publisher queue depth ${this.#queueDepth} (>= ${QUEUE_DEPTH_WARN}). ` +
          `Each pending statement is retained in the promise chain's closure until it drains; ` +
          `consider rate-limiting authoring sends or batching before sendStatement.`,
      );
    }
    this.#queueDepth++;
    let resolveOutcome!: (o: DestinationOutcome) => void;
    const outcomePromise = new Promise<DestinationOutcome>((r) => {
      resolveOutcome = r;
    });
    // Raw .then chaining (not async/await): when the previous send settles,
    // the next one runs synchronously up to fetch in the same microtask.
    const entry: UnsentEntry = {
      body: statementOrBatch,
      settle: resolveOutcome,
      taken: false,
    };
    this.#unsent.push(entry);
    this.#queue = this.#queue.then(() =>
      this.#sendQueued(entry, options).then((outcome) => {
        if (!outcome) return;
        this.#unsent.shift();
        this.#settle(entry, outcome);
      }),
    );
    return outcomePromise;
  }

  /**
   * Runs `fn` with the bytes of the closing batch `sendFinal(partial)` would
   * send counted against the keepalive quota, when it fits beside the
   * keepalive requests in flight, so the requests `fn` starts leave the batch
   * its share.
   */
  holdClosingQuota(partial: PartialStatement, fn: () => void): void {
    const body = this.#closingBody(this.buildStatement(partial));
    withKeepaliveHeld(byteLength(body), fn);
  }

  sendFinal(partial: PartialStatement): Promise<DestinationOutcome> {
    if (this.#unavailableReason) {
      return Promise.reject(this.#unavailableReason());
    }
    const final = this.buildStatement(partial);
    const body = this.#closingBody(final);
    const flushed = this.#unsent;
    this.#unsent = [];
    this.#closed = true;
    for (const e of flushed) e.taken = true;
    return this.#sendClosing(body).then(async (outcome) => {
      if (!flushed.length || !isClientError(outcome.status)) {
        for (const e of flushed) this.#settle(e, outcome);
        return this.#toDestination(outcome);
      }
      for (const e of flushed) {
        this.#settle(e, await this.#sendClosing(JSON.stringify(e.body)));
      }
      return this.#toDestination(
        await this.#sendClosing(JSON.stringify(final)),
      );
    });
  }

  /**
   * Chain an arbitrary task on the queue. Used by the launch adapters for
   * State API writes.
   *
   * The task is wrapped so a thrown error never breaks the queue's
   * Promise chain — subsequent enqueues still flow.
   */
  chainTask(fn: () => Promise<void>): Promise<void> {
    const closedAtEnqueue = this.#closed;
    this.#queue = this.#queue.then(() =>
      this.#closed !== closedAtEnqueue ? undefined : fn().catch(() => {}),
    );
    return this.#queue;
  }

  /** Resolves once every task queued so far has run. */
  drained(): Promise<void> {
    return this.#queue;
  }

  /**
   * Switch the publisher to "page is unloading" mode. Subsequent fetches
   * use `keepalive: true` so they survive the unload. The launch adapters
   * call this before `sendFinal`.
   */
  markUnloading(): void {
    this.#unloading = true;
  }

  markRestored(): void {
    this.#unloading = false;
  }

  /** Whether the publisher is in unloading mode. */
  isUnloading(): boolean {
    return this.#unloading;
  }

  // ---- Internal: send with retry policy ----

  #sendQueued(
    entry: UnsentEntry,
    options?: SendStatementOptions,
  ): Promise<SendOutcome | null> {
    const taken = () => entry.taken;
    return this.#sendRetrying(JSON.stringify(entry.body), {
      attempts: options?.retry === false ? 1 : RETRY_ATTEMPTS,
      stop: taken,
    }).then((outcome) => (taken() ? null : outcome));
  }

  #closingBody(final: Statement): string {
    if (!this.#unsent.length) return JSON.stringify(final);
    return JSON.stringify([...this.#unsent.flatMap((e) => e.body), final]);
  }

  #sendClosing(body: string): Promise<SendOutcome> {
    return this.#sendRetrying(body, {
      attempts: RETRY_ATTEMPTS,
      keepalive: true,
    });
  }

  #sendRetrying(
    body: string,
    opts: { attempts: number; keepalive?: boolean; stop?: () => boolean },
  ): Promise<SendOutcome> {
    const stop = opts.stop ?? (() => false);

    const attempt = (n: number): Promise<SendOutcome> => {
      const isFinal = n === opts.attempts - 1;
      // keepalive on final attempt (so it survives unload) and any
      // attempt after the adapter has flagged the page as unloading.
      const keepalive = opts.keepalive || isFinal || this.#unloading;
      return this.#sendOnce(body, keepalive).then((outcome) => {
        // 4xx (other than the 401 path which #sendOnce already retried) won't
        // recover, so short-circuit.
        if (outcome.ok || isClientError(outcome.status) || isFinal || stop()) {
          return outcome;
        }
        return new Promise<void>((r) => setTimeout(r, backoffMs(n))).then(() =>
          stop() ? outcome : attempt(n + 1),
        );
      });
    };

    return stop() ? Promise.resolve<SendOutcome>({ ok: false }) : attempt(0);
  }

  #settle(entry: UnsentEntry, outcome: SendOutcome): void {
    this.#queueDepth--;
    entry.settle(this.#toDestination(outcome));
  }

  #toDestination(outcome: SendOutcome): DestinationOutcome {
    return { endpoint: this.#endpoint, ...outcome };
  }

  #sendOnce(body: string, keepalive: boolean): Promise<SendOutcome> {
    if (this.#authDead) {
      return Promise.resolve({
        ok: false,
        error: new XAPIConfigError(
          'xapi.auth was rejected by the LRS twice in a row; refusing further sends for the publisher lifetime. Reload the runtime to retry.',
        ),
      });
    }
    // Hot path: cached auth — fetch fires synchronously inside this
    // function call, in the same microtask the queue's .then() ran.
    if (this.#cachedAuth !== null) {
      return this.#fetchWithToken(this.#cachedAuth, body, keepalive);
    }
    // Cold path: need to resolve the auth resolver.
    return this.#resolveAuth()
      .then((token) => this.#fetchWithToken(token, body, keepalive))
      .catch((err) => ({
        ok: false,
        error: toError(err),
      }));
  }

  #buildHeaders(token: string): Headers {
    const headers = new Headers();
    if (token) headers.set('Authorization', `Basic ${token}`);
    headers.set('X-Experience-API-Version', X_API_VERSION);
    headers.set('Content-Type', 'application/json');
    return headers;
  }

  #post(token: string, body: string, keepalive: boolean): Promise<Response> {
    return lrsFetch(this.#statementsUrl, {
      method: 'POST',
      headers: this.#buildHeaders(token),
      body,
      keepalive,
    });
  }

  #fetchWithToken(
    token: string,
    body: string,
    keepalive: boolean,
  ): Promise<SendOutcome> {
    return this.#post(token, body, keepalive)
      .then((resp) => this.#handleResponse(resp, body, keepalive))
      .catch((err) => ({
        ok: false,
        error: toError(err),
      }));
  }

  #handleResponse(
    resp: Response,
    body: string,
    keepalive: boolean,
  ): SendOutcome | Promise<SendOutcome> {
    // 401 with a function-form auth: invalidate cache, re-resolve once,
    // retry the same request.
    if (
      resp.status === 401 &&
      typeof this.#authValue === 'function' &&
      !this.#unloading
    ) {
      this.#cachedAuth = null;
      return this.#resolveAuth().then(
        (newToken) =>
          this.#post(newToken, body, keepalive).then((retryResp) => {
            if (retryResp.status !== 401) return outcomeOf(retryResp);
            this.#authDead = true;
            return {
              ok: false,
              status: 401,
              error: new Error(
                'LRS rejected re-resolved auth (consecutive 401s); auth resolver marked dead',
              ),
            };
          }),
        // A failed re-resolve keeps the 401 so the retry loop stops; only a
        // network error on the resend is retried.
        (err): SendOutcome => ({ ok: false, status: 401, error: toError(err) }),
      );
    }
    return outcomeOf(resp);
  }

  /** Only reached with function-form auth; the constructor caches static auth. */
  async #resolveAuth(): Promise<string> {
    let resolved: unknown;
    try {
      resolved = await (this.#authValue as () => string | Promise<string>)();
    } catch (err) {
      throw new XAPIConfigError(
        `xapi.auth resolver threw: ${errorMessage(err)}`,
      );
    }
    if (typeof resolved !== 'string' || !resolved) {
      throw new XAPIConfigError(
        'xapi.auth resolver must return a non-empty string',
      );
    }
    const err = validateAuthCredential(resolved);
    if (err) throw new XAPIConfigError(`xapi.auth: ${err}`);
    this.#cachedAuth = resolved;
    return resolved;
  }
}
