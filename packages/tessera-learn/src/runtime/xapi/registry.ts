import type { XAPIClient } from './client.js';

/**
 * Module-scoped client reference. CourseSession registers the client
 * once the session launches and clears it when the session ends;
 * `useXAPI()` reads from this slot. Plain TS (not a Svelte store):
 * callers read it at send time, so reactivity buys nothing.
 *
 * Resets to null on module init so the registry is empty before any
 * CourseSession has started. One JS realm = one course = one
 * client: this matches how Tessera is deployed (one course per
 * page-load) and the registry assumes that.
 */
let client: XAPIClient | null = null;

/**
 * Install the page's xAPI client. Called by CourseSession after the
 * adapter has completed its async init (cmi5 launch fetch, SCORM
 * LMSInitialize, etc.) and again after a back/forward cache restore
 * without an LMS. Pass `null` to unregister when the session ends.
 */
export function registerXAPIClient(c: XAPIClient | null): void {
  client = c;
}

/**
 * Get the page's xAPI client, or `null` when no LRS is configured
 * (web/scorm with no `config.xapi`), before CourseSession has registered
 * the client, or once the session has ended. Author code should
 * null-check the result and degrade gracefully:
 * `useXAPI()?.sendStatement(...)` works in every case.
 *
 * Callable from anywhere: `.svelte` setup blocks, event handlers, async
 * callbacks, plain `.ts` modules. Not a Svelte context hook.
 */
export function useXAPI(): XAPIClient | null {
  return client;
}
