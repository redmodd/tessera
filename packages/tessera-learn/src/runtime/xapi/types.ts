/**
 * xAPI types used by the publisher and registry. These mirror the relevant
 * subset of the xAPI 1.0.3 spec — the publisher only models Agents (not
 * Groups) for v1, and only the statement fields actually exercised by
 * Tessera or surfaced to authors.
 */

/**
 * Identified xAPI Agent. Exactly one of `mbox` / `mbox_sha1sum` / `openid` /
 * `account` must be present (the IFI rule). The publisher validates this on
 * any actor it resolves; values that fail produce a runtime error rather
 * than a silent LRS 400.
 */
export interface XAPIAgent {
  name?: string;
  mbox?: string;
  mbox_sha1sum?: string;
  openid?: string;
  account?: { homePage: string; name: string };
  objectType?: 'Agent';
  // Group support is non-goal for v1; field exists so a Group passed by an
  // author surfaces a friendly validation error instead of a TS mismatch.
  member?: unknown;
}

export interface XAPIVerb {
  id: string;
  display?: Record<string, string>;
}

export interface XAPIObject {
  id: string;
  objectType?: string;
  definition?: Record<string, unknown>;
}

export interface XAPIContext {
  registration?: string;
  contextActivities?: {
    parent?: Array<{ id: string }>;
    grouping?: Array<{ id: string }>;
    category?: Array<{ id: string }>;
    other?: Array<{ id: string }>;
  };
  extensions?: Record<string, unknown>;
}

export interface XAPIResult {
  success?: boolean;
  completion?: boolean;
  duration?: string;
  score?: { scaled?: number; raw?: number; min?: number; max?: number };
  response?: string;
  extensions?: Record<string, unknown>;
}

/**
 * Minimal partial-statement shape authors pass to `sendStatement`. The
 * publisher fills in actor, timestamp, registration, grouping, sessionid
 * extension, and statement id.
 */
export interface PartialStatement {
  verb: XAPIVerb;
  object?: XAPIObject;
  result?: XAPIResult;
  context?: XAPIContext;
  attachments?: unknown[];
}

/**
 * Fully-formed statement after the publisher has filled in its automatic
 * fields. Returned in `sendStatement`'s resolved value so authors can log
 * or assert on what was actually sent.
 */
export interface Statement {
  id: string;
  actor: XAPIAgent;
  verb: XAPIVerb;
  object: XAPIObject;
  result?: XAPIResult;
  context?: XAPIContext;
  timestamp: string;
  attachments?: unknown[];
}

export interface DestinationOutcome {
  endpoint: string;
  ok: boolean;
  status?: number;
  error?: Error;
}

export interface SendStatementResult {
  statementId: string;
  statement: Statement;
  destinations: DestinationOutcome[];
}

export interface SendStatementOptions {
  /**
   * When false, the publisher sends one attempt and reports the outcome
   * regardless of failure. Useful for high-volume telemetry where a missing
   * statement is harmless. Default: true (retry on 5xx/network).
   */
  retry?: boolean;
}
