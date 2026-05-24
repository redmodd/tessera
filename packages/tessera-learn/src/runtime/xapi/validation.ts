import type { PartialStatement } from './types.js';
export {
  validateAgent,
  validateAuthCredential,
  joinFieldError,
} from './agent-rules.js';

/** Thrown for runtime-validation failures (auth/actor resolver misuse). */
export class XAPIConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'XAPIConfigError';
  }
}

/** Thrown synchronously by `sendStatement` for partial-statement misuse. */
export class XAPIStatementError extends Error {
  statement: PartialStatement;
  constructor(message: string, statement: PartialStatement) {
    super(message);
    this.name = 'XAPIStatementError';
    this.statement = statement;
  }
}

/**
 * Validate a partial statement at the boundary. Three checks —
 * verb.id, object.id when supplied, score.scaled when supplied. Anything
 * else passes through; the LRS gives clearer errors than we can.
 *
 * Called from both the client (so a fan-out send fails once before any
 * destination's `buildStatement` runs) and the publisher (so a single-
 * destination caller bypassing the client is still validated).
 */
export function validatePartialStatement(partial: PartialStatement): void {
  if (!partial || typeof partial !== 'object') {
    throw new XAPIStatementError(
      'sendStatement: partial statement must be an object',
      partial,
    );
  }
  if (
    !partial.verb ||
    typeof partial.verb !== 'object' ||
    typeof partial.verb.id !== 'string' ||
    !partial.verb.id
  ) {
    throw new XAPIStatementError(
      'sendStatement: verb.id is required and must be a non-empty string',
      partial,
    );
  }
  if (partial.object !== undefined) {
    if (
      !partial.object ||
      typeof partial.object !== 'object' ||
      typeof partial.object.id !== 'string' ||
      !partial.object.id
    ) {
      throw new XAPIStatementError(
        'sendStatement: object.id must be a non-empty string when object is supplied',
        partial,
      );
    }
  }
  const scaled = partial.result?.score?.scaled;
  if (scaled !== undefined) {
    if (
      typeof scaled !== 'number' ||
      !Number.isFinite(scaled) ||
      scaled < -1 ||
      scaled > 1
    ) {
      throw new XAPIStatementError(
        `sendStatement: result.score.scaled must be a number in [-1, 1], got ${scaled}`,
        partial,
      );
    }
  }
}
