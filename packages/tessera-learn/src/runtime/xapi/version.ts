/**
 * xAPI version negotiated by Tessera. Sent as the `X-Experience-API-Version`
 * header on every Statement / State API request.
 *
 * Pinned to ADL xAPI 1.0.3 — NOT IEEE 9274.1.1 (xAPI 2.0) — because:
 *
 *  1. cmi5 v1.0 (the LMS-launch profile we implement) is normatively bound
 *     to xAPI 1.0.x: §3 / §11 require LRS communication at 1.0.x and the
 *     `X-Experience-API-Version: 1.0.x` header. A conformant cmi5 LMS will
 *     reject a `2.0.0` header on its launch endpoint.
 *  2. ADL has not yet published a cmi5 revision rebased on IEEE 9274. Until
 *     they do, every cmi5 launch in the wild expects 1.0.x.
 *  3. None of the 2.0 additions (typed extensions, attachments-by-reference,
 *     profile registry) are features the runtime exercises — the wire format
 *     for the statement / state / registration / sessionid extension we use
 *     is unchanged.
 *
 * The right time to bump is when ADL releases cmi5 v2; that work will need
 * proper version negotiation (the LRS announces its supported versions and
 * the AU picks the highest mutually-supported one), not just a constant
 * change here.
 */
export const X_API_VERSION = '1.0.3';
