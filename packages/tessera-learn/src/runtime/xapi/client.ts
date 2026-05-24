import type {
  PartialStatement,
  SendStatementOptions,
  SendStatementResult,
  XAPIAgent,
  Statement,
  DestinationOutcome,
} from './types.js';
import { XAPIPublisher } from './publisher.js';
import { validatePartialStatement, XAPIConfigError } from './validation.js';
import { uuidv4 } from './uuid.js';

/**
 * What `useXAPI()` returns. Wraps one or more `XAPIPublisher` destinations
 * and presents a single `sendStatement` API to authors. The single-
 * destination form (`xapi: { ... }`) and the multi-destination form
 * (`xapi: [{...}, {...}]`) flow through the same machinery — single is
 * just a one-element array.
 *
 * Each destination has its own queue, auth resolver, and retry loop;
 * failures are isolated. One UUID is minted per `sendStatement` call and
 * reused across destinations so analytics keyed on `statement.id` see
 * identical statements regardless of which LRS they hit first.
 */
export class XAPIClient {
  readonly #publishers: XAPIPublisher[];

  constructor(publishers: XAPIPublisher[]) {
    if (publishers.length === 0) {
      throw new Error('XAPIClient: at least one publisher is required');
    }
    this.#publishers = publishers;
  }

  /**
   * Send a statement to every configured destination. The returned
   * promise resolves once all destinations have settled (success or
   * final failure). Per-destination outcomes are exposed on
   * `result.destinations` so authors can act on partial failures.
   *
   * Validation failures throw synchronously — the returned promise
   * rejects before any HTTP traffic.
   */
  sendStatement(
    partial: PartialStatement,
    options?: SendStatementOptions,
  ): Promise<SendStatementResult> {
    try {
      validatePartialStatement(partial);
    } catch (err) {
      return Promise.reject(err);
    }
    // cmi5 §9.3.6 — Terminated must be the last statement of the session.
    // The constraint is per-destination: only cmi5-mode publishers (the
    // shared-queue cmi5 adapter case) need to block author sends during
    // unload. Independent explicit-LRS destinations have no such ordering
    // requirement and stay healthy until the browser tears them down.
    const blocked = (p: XAPIPublisher) => p.isUnloading() && p.isCmi5Mode();
    if (this.#publishers.every(blocked)) {
      return Promise.reject(
        new XAPIConfigError(
          'XAPIClient.sendStatement: page is unloading; author statements queued during unload are dropped to keep Terminated last (cmi5 §9.3.6).',
        ),
      );
    }
    const id = uuidv4();
    // The first publisher's built statement is what we return as the
    // canonical `statement` in the result. Other destinations may have
    // a different actor/grouping but the verb/object/result/timestamp
    // are author-supplied and identical.
    let primary: Statement | null = null;
    const destinationPromises: Promise<DestinationOutcome>[] = [];
    for (let i = 0; i < this.#publishers.length; i++) {
      const pub = this.#publishers[i];
      const built = pub.buildStatement(partial, { id });
      if (i === 0) primary = built;
      if (blocked(pub)) {
        destinationPromises.push(
          Promise.resolve<DestinationOutcome>({
            endpoint: pub.getEndpoint(),
            ok: false,
            error: new XAPIConfigError(
              'destination skipped: cmi5 publisher is unloading; statement dropped to keep Terminated last (cmi5 §9.3.6).',
            ),
          }),
        );
        continue;
      }
      destinationPromises.push(pub.enqueueBuilt(built, options));
    }
    return Promise.all(destinationPromises).then((destinations) => ({
      statementId: id,
      statement: primary as Statement,
      destinations,
    }));
  }

  /**
   * Returns the actor of the first destination. For analytics object-id
   * construction (`${xapi.getActivityId()}#widget-1`) this is what
   * authors typically want.
   */
  getActor(): XAPIAgent {
    return this.#publishers[0].getActor();
  }

  /** Returns the activityId of the first destination. */
  getActivityId(): string {
    return this.#publishers[0].getActivityId();
  }

  /** Returns the sessionId of the first destination. */
  getSessionId(): string {
    return this.#publishers[0].getSessionId();
  }

  /** Returns the underlying publishers — mostly useful for tests. */
  getPublishers(): readonly XAPIPublisher[] {
    return this.#publishers;
  }

  /**
   * Propagate "page is unloading" to every publisher. App.svelte's
   * pagehide / beforeunload handler calls this before
   * `adapter.terminate()` so independent (explicit-endpoint) publishers
   * also stop accepting author sends during the close path. Idempotent;
   * the cmi5 adapter calls `markUnloading()` on its own publisher
   * separately and either order is fine.
   */
  markUnloading(): void {
    for (const p of this.#publishers) p.markUnloading();
  }
}
