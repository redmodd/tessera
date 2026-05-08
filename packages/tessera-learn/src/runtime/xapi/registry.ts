import type { XAPIClient } from './client.js';

/**
 * Module-scoped client reference. App.svelte calls
 * `registerXAPIClient(client)` once after the persistence adapter
 * finishes its async init; `useXAPI()` reads from this slot. Plain TS
 * (not a Svelte store) — the client reference is stable for the
 * lifetime of the page-load and reactivity buys nothing.
 *
 * Resets to null on module init so the registry is empty before any
 * App.svelte instance has run. One JS realm = one course = one
 * client: this matches how Tessera is deployed (one course per
 * page-load) and the registry assumes that.
 */
let client: XAPIClient | null = null;

/**
 * Install the page's xAPI client. Called once by App.svelte after the
 * adapter has completed its async init (cmi5 launch fetch, SCORM
 * LMSInitialize, etc.). Pass `null` to unregister at teardown.
 */
export function registerXAPIClient(c: XAPIClient | null): void {
  client = c;
}

/**
 * Get the page's xAPI client, or `null` when no LRS is configured
 * (web/scorm with no `config.xapi`) or when called before App.svelte has
 * registered the client. Author code should null-check the result and
 * degrade gracefully — `useXAPI()?.sendStatement(...)` works in both
 * cases.
 *
 * Callable from anywhere — `.svelte` setup blocks, event handlers, async
 * callbacks, plain `.ts` modules. Not a Svelte context hook.
 */
export function useXAPI(): XAPIClient | null {
  return client;
}
