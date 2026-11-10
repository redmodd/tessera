import type {
  PartialStatement,
  SendStatementOptions,
  SendStatementResult,
  XAPIAgent,
} from './types.js';
import { XAPIPublisher } from './publisher.js';
import { validatePartialStatement } from './validation.js';
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
   * Validation failures reject before any HTTP traffic. The first
   * destination's built statement is returned as the canonical `statement`:
   * other destinations may differ in actor or grouping, but the
   * author-supplied verb, object, result and timestamp are identical.
   */
  async sendStatement(
    partial: PartialStatement,
    options?: SendStatementOptions,
  ): Promise<SendStatementResult> {
    validatePartialStatement(partial);
    const id = uuidv4();
    const statements = this.#publishers.map((pub) =>
      pub.buildStatement(partial, { id }),
    );
    const destinations = await Promise.all(
      this.#publishers.map((pub, i) =>
        pub.enqueueBuilt(statements[i], options),
      ),
    );
    return { statementId: id, statement: statements[0], destinations };
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

  /**
   * Propagate "page is unloading" to every publisher so independent
   * (explicit-endpoint) destinations send with `keepalive` during the close
   * path. Idempotent; the launch adapters call `markUnloading()` on their
   * own publisher separately and either order is fine.
   */
  markUnloading(): void {
    for (const p of this.#publishers) p.markUnloading();
  }

  markRestored(): void {
    for (const p of this.#publishers) p.markRestored();
  }

  /** Resolves once every destination has sent what it has queued, or at `deadline`. */
  async flush(deadline: Promise<unknown>): Promise<void> {
    await Promise.race([
      Promise.all(this.#publishers.map((p) => p.drained())),
      deadline,
    ]);
  }
}
