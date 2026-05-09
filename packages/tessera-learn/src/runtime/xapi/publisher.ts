import type {
  XAPIAgent,
  Statement,
  PartialStatement,
  SendStatementOptions,
  SendStatementResult,
  DestinationOutcome,
} from './types.js';
import { uuidv4 } from './uuid.js';
import { X_API_VERSION } from './version.js';
import {
  validatePartialStatement,
  validateAgent,
  validateAuthCredential,
  XAPIConfigError,
  XAPIStatementError,
} from './validation.js';
import { RETRY_ATTEMPTS, backoffMs } from '../adapters/retry.js';

/** cmi5 §9.6.2 — well-known IRI owned by ADL for the cmi5 session id extension. */
const CMI5_SESSIONID_EXT =
  'https://w3id.org/xapi/cmi5/context/extensions/sessionid';

/**
 * Combine a field label (e.g. `xapi.actor`) with the prefix-friendly suffix
 * returned by `validateAgent`. Sub-field suffixes start with `.` and chain
 * directly (`xapi.actor.mbox …`); top-level messages get a `: ` separator
 * (`xapi.actor: must be an object`).
 */
function joinFieldError(label: string, suffix: string): string {
  return suffix.startsWith('.') ? `${label}${suffix}` : `${label}: ${suffix}`;
}

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
  /** Optional UUID — primarily a cmi5 launch concept. */
  registration?: string;
  /** Optional caller-supplied session id. cmi5 adapter supplies its own. */
  sessionId?: string;
  /**
   * When true, every statement carries the cmi5 sessionid context extension.
   * Set by the cmi5 adapter and by 'lms'-inherited destinations under cmi5.
   */
  cmi5Mode?: boolean;
  /** When set, every send method rejects with the returned Error without hitting the network. */
  unavailableReason?: () => Error;
}

interface SendOutcome {
  ok: boolean;
  status?: number;
  error?: Error;
}

const STATEMENT_RETRY_ATTEMPTS = RETRY_ATTEMPTS;
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
 * Browsers cap the cumulative body size of `keepalive: true` fetches at
 * 64 KiB per page. A batched statement payload above this threshold is
 * silently dropped during unload — the request never leaves the browser.
 * We log when a keepalive send would exceed the cap so the data loss is
 * at least visible. Splitting the batch isn't safe here (statements
 * within a batch are atomic from the LRS's perspective; partial sends
 * would corrupt ordering against Terminated), so the warning is the
 * useful signal.
 */
const KEEPALIVE_BODY_LIMIT_BYTES = 64 * 1024;

/**
 * Single-destination xAPI publisher. Builds and sends statements with
 * sequential queue ordering, retry on 5xx/network errors, and 401-driven
 * auth re-resolution.
 *
 * The cmi5 adapter constructs one of these for its lifecycle stream
 * (`cmi5Mode: true`). Author-config destinations construct one (or more,
 * fanned out) via the runtime registry.
 */
export class XAPIPublisher {
  readonly #endpoint: string;
  readonly #statementsUrl: string;
  readonly #activityId: string;
  readonly #registration?: string;
  readonly #sessionId: string;
  readonly #cmi5Mode: boolean;

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
  #initPromise: Promise<void> | null = null;

  // Sequential send chain — chains promises so statements arrive at the
  // LRS in the order they were enqueued.
  #queue: Promise<void> = Promise.resolve();
  #queueDepth = 0;
  #queueWarned = false;
  #unloading = false;

  constructor(opts: XAPIPublisherOptions) {
    if (!opts.endpoint || typeof opts.endpoint !== 'string') {
      throw new XAPIConfigError('XAPIPublisher: endpoint is required');
    }
    if (!/^https?:\/\//i.test(opts.endpoint)) {
      throw new XAPIConfigError(
        'XAPIPublisher: endpoint must be an absolute http(s) URL'
      );
    }
    if (!opts.activityId) {
      throw new XAPIConfigError('XAPIPublisher: activityId is required');
    }
    this.#endpoint = opts.endpoint.replace(/\/?$/, '/');
    this.#statementsUrl = `${this.#endpoint}statements`;
    this.#activityId = opts.activityId;
    this.#registration = opts.registration;
    this.#cmi5Mode = !!opts.cmi5Mode;
    this.#authValue = opts.auth;
    this.#actorValue = opts.actor;
    this.#sessionId = opts.sessionId ?? uuidv4();
    this.#unavailableReason = opts.unavailableReason ?? null;

    if (typeof this.#actorValue !== 'function') {
      this.#cachedActor = this.#actorValue;
    }
    // Eagerly cache static auth (including the empty-string sentinel for
    // an unauthenticated cmi5 launch where the fetch URL produced no
    // token) so the hot send path stays synchronous up to fetch().
    if (typeof this.#authValue !== 'function') {
      this.#cachedAuth = this.#authValue;
    }
  }

  /**
   * Resolve actor (if function-form) and validate it. Idempotent.
   * Throws `XAPIConfigError` if the resolved actor fails the Identified
   * Agent rule. App.svelte awaits init before registering the publisher
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
          `xapi.actor resolver threw: ${err instanceof Error ? err.message : String(err)}`
        );
      }
      const err = validateAgent(resolved);
      if (err) throw new XAPIConfigError(joinFieldError('xapi.actor', err));
      this.#cachedActor = resolved as XAPIAgent;
    } else if (this.#cachedActor) {
      const err = validateAgent(this.#cachedActor);
      if (err) throw new XAPIConfigError(joinFieldError('xapi.actor', err));
    } else {
      throw new XAPIConfigError('xapi.actor is required');
    }
    // Validate static auth eagerly. An empty string is allowed (the
    // unauthenticated cmi5 case where the LMS fetch URL produced no
    // token) — only non-empty values are run through the Basic/Bearer
    // prefix checks.
    if (typeof this.#authValue === 'string' && this.#authValue.length > 0) {
      const aErr = validateAuthCredential(this.#authValue);
      if (aErr) throw new XAPIConfigError(`xapi.auth: ${aErr}`);
    }
  }

  /** Returns the cached actor. Must be called after `init()` resolves. */
  getActor(): XAPIAgent {
    if (!this.#cachedActor) {
      throw new XAPIConfigError(
        'XAPIPublisher.getActor() called before init() resolved. Await publisher.init() before reading the actor.'
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

  /** Resolved http(s) endpoint URL (with trailing slash). */
  getEndpoint(): string {
    return this.#endpoint;
  }

  /**
   * Build a fully-formed statement from a partial. Mints a UUID, fills in
   * actor / timestamp / context.registration / context.contextActivities.grouping
   * and (when in cmi5 mode) the cmi5 sessionid extension. Caller-supplied
   * `context` keys are preserved; publisher-supplied values fill gaps.
   *
   * `opts.id` lets a fan-out wrapper share a single UUID across every
   * destination's statement so all LRSes see the same id (idempotent
   * dedupe works across destinations).
   */
  buildStatement(partial: PartialStatement, opts?: { id?: string }): Statement {
    if (!this.#cachedActor) {
      throw new XAPIConfigError(
        'XAPIPublisher.buildStatement() called before init() resolved.'
      );
    }
    const userCtx = partial.context ?? {};
    const userCtxActivities = userCtx.contextActivities ?? {};
    const grouping = userCtxActivities.grouping ?? [{ id: this.#activityId }];

    const context: NonNullable<Statement['context']> = {
      ...userCtx,
      contextActivities: {
        ...userCtxActivities,
        grouping,
      },
    };
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

    const object = partial.object ?? {
      id: this.#activityId,
      objectType: 'Activity',
    };

    const statement: Statement = {
      id: opts?.id ?? uuidv4(),
      actor: this.#cachedActor,
      verb,
      object,
      context,
      timestamp: new Date().toISOString(),
    };
    if (partial.result !== undefined) statement.result = partial.result;
    if (partial.attachments !== undefined) statement.attachments = partial.attachments;
    return statement;
  }

  /**
   * Author API. Validates the partial, builds the statement, enqueues it,
   * resolves with the per-destination outcome (single-element since this
   * class is single-destination — the fan-out wrapper combines them).
   *
   * Validation failures (verb.id missing, object.id missing when supplied,
   * score.scaled out of range) throw synchronously — the returned promise
   * rejects before any HTTP traffic happens.
   */
  sendStatement(
    partial: PartialStatement,
    options?: SendStatementOptions & { id?: string }
  ): Promise<SendStatementResult> {
    if (this.#unavailableReason) {
      return Promise.reject(this.#unavailableReason());
    }
    try {
      validatePartialStatement(partial);
    } catch (err) {
      // Caller-friendly: surface validation errors as a rejected promise
      // so both `await sendStatement(...)` and
      // `sendStatement(...).catch(...)` paths see them. The rejection
      // happens before any HTTP traffic — no LRS round-trip is started.
      return Promise.reject(err);
    }
    if (!this.#cachedActor) {
      return Promise.reject(
        new XAPIConfigError(
          'XAPIPublisher.sendStatement() called before init() resolved.'
        )
      );
    }
    const statement = this.buildStatement(partial, { id: options?.id });
    return this.enqueueBuilt(statement, options).then((outcome) => ({
      statementId: statement.id,
      statement,
      destinations: [outcome],
    }));
  }

  /**
   * Enqueue a pre-built statement (or array as a single batch POST) onto
   * the queue. Returns a promise that resolves with the outcome once the
   * send settles. Used by the cmi5 adapter for its lifecycle stream and
   * its interaction batches.
   */
  enqueueBuilt(
    statementOrBatch: Statement | Statement[],
    options?: SendStatementOptions
  ): Promise<DestinationOutcome> {
    if (this.#unavailableReason) {
      return Promise.reject(this.#unavailableReason());
    }
    if (this.#queueDepth >= QUEUE_DEPTH_SATURATED) {
      return Promise.resolve<DestinationOutcome>({
        endpoint: this.#endpoint,
        ok: false,
        error: new XAPIConfigError(
          `XAPIPublisher queue saturated (${this.#queueDepth} in-flight); refusing further sends until the LRS catches up.`
        ),
      });
    }
    if (!this.#queueWarned && this.#queueDepth >= QUEUE_DEPTH_WARN) {
      this.#queueWarned = true;
      console.warn(
        `Tessera: xAPI publisher queue depth ${this.#queueDepth} (>= ${QUEUE_DEPTH_WARN}). ` +
          `Each pending statement is retained in the promise chain's closure until it drains; ` +
          `consider rate-limiting authoring sends or batching before sendStatement.`
      );
    }
    this.#queueDepth++;
    let resolveOutcome!: (o: DestinationOutcome) => void;
    const outcomePromise = new Promise<DestinationOutcome>((r) => {
      resolveOutcome = r;
    });
    // Use raw .then chaining (not async/await) so that when the queue's
    // previous promise resolves, the next .then's microtask runs the send
    // path synchronously up to fetch — same timing as the original
    // cmi5.ts queue, which a few tests rely on (e.g., Initialized must
    // POST before mockClear() runs in the test body).
    this.#queue = this.#queue.then(() =>
      this.#sendWithRetry(statementOrBatch, options).then((outcome) => {
        this.#queueDepth--;
        resolveOutcome({
          endpoint: this.#endpoint,
          ok: outcome.ok,
          status: outcome.status,
          error: outcome.error,
        });
      })
    );
    return outcomePromise;
  }

  /**
   * Chain an arbitrary task on the queue. Used by the cmi5 adapter for
   * State API writes that need to land before Terminated.
   *
   * The task is wrapped so a thrown error never breaks the queue's
   * Promise chain — subsequent enqueues still flow.
   */
  chainTask(fn: () => Promise<void>): Promise<void> {
    let resolveTask!: () => void;
    const taskPromise = new Promise<void>((r) => {
      resolveTask = r;
    });
    this.#queue = this.#queue.then(() =>
      fn().catch(() => {}).then(() => resolveTask())
    );
    return taskPromise;
  }

  /**
   * Switch the publisher to "page is unloading" mode. Subsequent fetches
   * use `keepalive: true` so they survive the unload. The cmi5 adapter
   * calls this before enqueuing the final Terminated statement.
   */
  markUnloading(): void {
    this.#unloading = true;
  }

  /** Whether the publisher is in unloading mode (for tests). */
  isUnloading(): boolean {
    return this.#unloading;
  }

  /** Whether this publisher participates in cmi5 ordering (Terminated must be last). */
  isCmi5Mode(): boolean {
    return this.#cmi5Mode;
  }

  // ---- Internal: send with retry policy ----

  #sendWithRetry(
    statementOrBatch: Statement | Statement[],
    options?: SendStatementOptions
  ): Promise<SendOutcome> {
    const body = JSON.stringify(statementOrBatch);
    const retry = options?.retry !== false; // default: retry enabled
    const maxAttempts = retry ? STATEMENT_RETRY_ATTEMPTS : 1;

    const attempt = (n: number): Promise<SendOutcome> => {
      const isFinal = n === maxAttempts - 1;
      // keepalive on final attempt (so it survives unload) and any
      // attempt after the adapter has flagged the page as unloading.
      const keepalive = isFinal || this.#unloading;
      if (keepalive && body.length > KEEPALIVE_BODY_LIMIT_BYTES) {
        const count = Array.isArray(statementOrBatch)
          ? statementOrBatch.length
          : 1;
        console.warn(
          `Tessera: xAPI ${count}-statement batch is ${body.length} bytes, ` +
            `over the 64 KiB keepalive cap. The browser may silently drop this ` +
            `request during unload. Reduce per-statement size or split sends ` +
            `before terminate.`
        );
      }
      return this.#sendOnce(body, keepalive).then((outcome) => {
        if (outcome.ok) return outcome;
        // 4xx (other than the 401 path which #sendOnce already retried) won't
        // recover — short-circuit.
        if (
          outcome.status !== undefined &&
          outcome.status >= 400 &&
          outcome.status < 500
        ) {
          return outcome;
        }
        if (isFinal) return outcome;
        return new Promise<void>((r) =>
          setTimeout(r, backoffMs(n))
        ).then(() => attempt(n + 1));
      });
    };

    return attempt(0);
  }

  #sendOnce(body: string, keepalive: boolean): Promise<SendOutcome> {
    if (this.#authDead) {
      return Promise.resolve({
        ok: false,
        error: new XAPIConfigError(
          'xapi.auth was rejected by the LRS twice in a row; refusing further sends for the publisher lifetime. Reload the runtime to retry.'
        ),
      });
    }
    // Hot path: cached auth — fetch fires synchronously inside this
    // function call, in the same microtask the queue's .then() ran.
    if (this.#cachedAuth !== null) {
      return this.#fetchWithToken(this.#cachedAuth, body, keepalive);
    }
    // Cold path: need to resolve the auth resolver.
    return this.#resolveAuth(false)
      .then((token) => this.#fetchWithToken(token, body, keepalive))
      .catch((err) => ({
        ok: false,
        error: err instanceof Error ? err : new Error(String(err)),
      }));
  }

  #fetchWithToken(
    token: string,
    body: string,
    keepalive: boolean
  ): Promise<SendOutcome> {
    const headers = new Headers();
    if (token) headers.set('Authorization', `Basic ${token}`);
    headers.set('X-Experience-API-Version', X_API_VERSION);
    headers.set('Content-Type', 'application/json');
    return fetch(this.#statementsUrl, {
      method: 'POST',
      headers,
      body,
      keepalive,
    })
      .then((resp) => this.#handleResponse(resp, body, keepalive))
      .catch((err) => ({
        ok: false,
        error: err instanceof Error ? err : new Error(String(err)),
      }));
  }

  #handleResponse(
    resp: Response,
    body: string,
    keepalive: boolean
  ): Promise<SendOutcome> | SendOutcome {
    if (resp.ok || resp.status === 409) {
      return { ok: true, status: resp.status };
    }
    // 401 with a function-form auth: invalidate cache, re-resolve once,
    // retry the same request.
    if (
      resp.status === 401 &&
      typeof this.#authValue === 'function' &&
      !this.#unloading
    ) {
      this.#cachedAuth = null;
      return this.#resolveAuth(true)
        .then((newToken) => {
          const retryHeaders = new Headers();
          if (newToken) retryHeaders.set('Authorization', `Basic ${newToken}`);
          retryHeaders.set('X-Experience-API-Version', X_API_VERSION);
          retryHeaders.set('Content-Type', 'application/json');
          return fetch(this.#statementsUrl, {
            method: 'POST',
            headers: retryHeaders,
            body,
            keepalive,
          });
        })
        .then((retryResp): SendOutcome => {
          if (retryResp.ok || retryResp.status === 409) {
            return { ok: true, status: retryResp.status };
          }
          if (retryResp.status === 401) {
            this.#authDead = true;
            return {
              ok: false,
              status: 401,
              error: new Error(
                'LRS rejected re-resolved auth (consecutive 401s); auth resolver marked dead'
              ),
            };
          }
          return {
            ok: false,
            status: retryResp.status,
            error: new Error(`LRS responded ${retryResp.status}`),
          };
        })
        .catch(
          (err): SendOutcome => ({
            ok: false,
            status: 401,
            error: err instanceof Error ? err : new Error(String(err)),
          })
        );
    }
    return {
      ok: false,
      status: resp.status,
      error: new Error(`LRS responded ${resp.status}`),
    };
  }

  #resolveAuth(forceRefresh: boolean): Promise<string> {
    if (!forceRefresh && this.#cachedAuth !== null) {
      return Promise.resolve(this.#cachedAuth);
    }
    if (typeof this.#authValue === 'string') {
      // Static auth: an empty string means unauthenticated (the cmi5 case
      // where the LMS fetch URL produced no token); otherwise revalidate.
      if (this.#authValue.length > 0) {
        const err = validateAuthCredential(this.#authValue);
        if (err) return Promise.reject(new XAPIConfigError(`xapi.auth: ${err}`));
      }
      this.#cachedAuth = this.#authValue;
      return Promise.resolve(this.#cachedAuth);
    }
    return Promise.resolve()
      .then(() => (this.#authValue as () => string | Promise<string>)())
      .then((resolved) => {
        if (typeof resolved !== 'string' || !resolved) {
          throw new XAPIConfigError(
            'xapi.auth resolver must return a non-empty string'
          );
        }
        const err = validateAuthCredential(resolved);
        if (err) throw new XAPIConfigError(`xapi.auth: ${err}`);
        this.#cachedAuth = resolved;
        return resolved;
      })
      .catch((err) => {
        if (err instanceof XAPIConfigError) throw err;
        throw new XAPIConfigError(
          `xapi.auth resolver threw: ${err instanceof Error ? err.message : String(err)}`
        );
      });
  }
}

