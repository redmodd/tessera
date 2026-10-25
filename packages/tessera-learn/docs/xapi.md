# Custom xAPI statements

Part of the Tessera authoring guide. [`AGENTS.md`](../AGENTS.md) holds the rules that apply to every task: read it first.

Tessera sends its own statements automatically: Initialized, Answered (one per question), Scored (when the course score changes), Completed, Passed, Failed and Terminated. Under SCORM it writes `cmi.*` instead. To emit your own verbs, use `useXAPI()`:

```ts
import { useXAPI } from 'tessera-learn';

const xapi = useXAPI(); // XAPIClient | null
xapi?.sendStatement({
  verb: { id: 'http://adlnet.gov/expapi/verbs/experienced' },
  object: { id: `${xapi.getActivityId()}#diagram-1` },
});
```

`useXAPI()` is callable anywhere (setup, handlers, async, `.ts` modules). It returns `null` when no LRS is configured, before adapter init resolves, or once the session has ended (Exit or page close): **null-check and degrade gracefully**. The client exposes `sendStatement(statement, options?)`, `getActivityId()`, `getActor()` and `getSessionId()`; the getters read the first destination. The publisher fills in `actor`, `timestamp`, `id`, `context.contextActivities.grouping`, `context.registration` (the cmi5 launch's, or an explicit destination's optional `registration` UUID v4) and (cmi5) `sessionid`; you supply `verb`, optionally `object` (defaults to the activity), `result`, `context`, `attachments`.

## Configure the destination

`config.xapi` is one destination or an array, always explicit (no implicit default). Every explicit destination needs a unique `id`. Pick one of three shapes.

An explicit LRS, with its resolvers in `course.runtime.js`:

```js
// course.config.js
export default {
  // ...
  xapi: {
    id: 'lrs',
    endpoint: 'https://lrs.example.com/xapi/',
    activityId: 'https://example.com/courses/intro-to-x',
  },
};
```

```js
// course.runtime.js: resolvers for destination "lrs"
export const xapi = {
  lrs: {
    auth: () => fetch('/api/lrs-token').then((r) => r.text()),
    actor: () => getCurrentUser(),
  },
};
```

The LMS launch LRS (cmi5 / xapi; ignored under other standards). It takes no other field:

```js
// course.config.js
export default {
  // ...
  xapi: { endpoint: 'lms' },
};
```

A fan-out, with at most one `'lms'` entry:

```js
// course.config.js
export default {
  // ...
  xapi: [
    { endpoint: 'lms' },
    {
      id: 'analytics',
      endpoint: 'https://analytics.example.com/xapi/',
      activityId: 'https://example.com/courses/intro-to-x',
    },
  ],
};
```

| Field   | In `course.config.js`                   | In `course.runtime.js` `xapi[id]`                            |
| ------- | --------------------------------------- | ------------------------------------------------------------ |
| `auth`  | credential string (ships in the bundle) | `() => string \| Promise<string>`, re-invoked once on 401    |
| `actor` | static Agent object                     | `() => Agent \| Promise<Agent>`, resolved once per page load |

- Set each field in one file, not both. `auth` is required in one of them.
- Every `xapi` export key must match an explicit destination `id`. Write the export as an object literal so the build can check the pairing.

Each destination has its own queue, auth resolver, and retry loop. One UUID per `sendStatement` is reused across destinations (idempotent dedupe).

## Per-mode behaviour

| Mode          | `xapi` not set     | `xapi.endpoint: 'lms'`  | `xapi: {endpoint, ...}` (explicit)                      |
| ------------- | ------------------ | ----------------------- | ------------------------------------------------------- |
| **cmi5**      | `useXAPI()` → null | Inherits launch LRS     | Independent publisher; `actor` defaults to launch actor |
| **xapi**      | `useXAPI()` → null | Inherits launch LRS     | Independent publisher; `actor` defaults to launch actor |
| **scorm12**   | `useXAPI()` → null | Ignored (build warning) | Independent; `actor` derived from `cmi.core.student_id` |
| **scorm2004** | `useXAPI()` → null | Ignored (build warning) | Independent; `actor` derived from `cmi.learner_id`      |
| **web**       | `useXAPI()` → null | Ignored (build warning) | Independent; `actor` **required** (config or resolver)  |

## Gotchas

- **Actor priority:** an author-supplied actor (`xapi.actor` or a `course.runtime.js` resolver) always wins; else cmi5 launch actor; else SCORM-derived from the LMS data model. If the SCORM LMS supplies no learner id, that destination is skipped with a console warning, so `useXAPI()` is null when it was the only one. Override the SCORM-derived `homePage` via `actorAccountHomePage` (required if `activityId` is a non-URL IRI).
- **Auth is Basic-only.** Pass the credential value, not the full header (the publisher prepends `Basic `). For OAuth, return a Basic credential from your `auth` resolver or run a proxy.
- **No static `auth` string in production** (it ships in the bundle and the build warns). Export an `auth` resolver that fetches a server-brokered short-lived token. CORS must allow the served origin.
- **`actor` is resolved once per page load** (no mid-session identity change; reload to switch).
- **Page unload rejects sends.** Once unload begins, `sendStatement` rejects (keeps cmi5 Terminated last). Do end-of-session work in a child component's `onDestroy`, not `beforeunload`.
- **Retry:** 3 attempts, exponential backoff; 5xx/network retry, 4xx short-circuits, 409 treated as success. Opt out per call with `sendStatement(stmt, { retry: false })`.

## `sendStatement` return shape

```ts
const result = await xapi.sendStatement({ verb, object });
// { statementId, statement, destinations: [{ endpoint, ok, status?, error? }, ...] }
```

`destinations[]` lets you handle partial failures under fan-out. The publisher validates only: `verb.id` non-empty, `object.id` non-empty when supplied, `result.score.scaled` in `[-1, 1]` when supplied, and that the statement is JSON-serializable. Everything else passes through; the LRS reports shape errors via `destinations[].error`.

## Not supported

OAuth at the publisher level, statement signing/attachment helpers, offline/IndexedDB queue, State API under SCORM and web, voiding, mid-session actor refresh, group actors.
