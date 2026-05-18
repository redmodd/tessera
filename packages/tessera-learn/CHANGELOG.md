# tessera-learn

## 0.0.10

### Patch Changes

- - **Smaller bundle for non-LMS courses.** Component CSS is now extracted and code-split alongside its JS chunks rather than injected at runtime; per-component styles for Carousel/Video/Audio/Matching/Sorting/FillInTheBlank no longer ship in the entry chunk. The package declares `"sideEffects": ["**/*.css"]` so Rollup can tree-shake unused component re-exports from a `bare`-template course.

  - **Selected LMS adapter only.** A `web` course no longer ships SCORM 1.2 + SCORM 2004 + cmi5 adapters and their dialect tables. The plugin emits only the adapter matching `export.standard`; dev mode still falls back to `WebAdapter` when the LMS API is unreachable.

  - **xAPI client gate.** When the build targets `web` / `scorm12` / `scorm2004` with no `xapi:` config, the entire `xapi/` subtree (publisher, validation, client, agent-rules, derive-actor, version, uuid, types) drops from the bundle. cmi5 keeps the real client because its adapter shares the publisher queue.

  - **First page chunk preloaded.** The plugin emits a `<link rel="modulepreload">` for the first page's chunk so the browser fetches it in parallel with the entry rather than waiting for the entry to mount.

  - **No flash-of-blank on cached navigation.** The outgoing page stays mounted until the next module resolves; `PageComponent`, `pageContext.quiz`, and `pageError` no longer flip synchronously before the await. Cached navigations swap in place.

  - **Next page prefetched.** After each `loadPage` resolves, `requestIdleCallback` warms the next reachable chunk. `pointerenter` / `focusin` on the Next button and sidebar links cover sub-100ms intent for mouse, stylus, and keyboard users.

  - **Runtime micro-perf.** `parseColor` replaces its DOM-insertion trick with canvas normalization (no forced style recalc on first paint). Quiz `feedbackShown` / `lockedCorrect` use `SvelteSet` so revealing one question only re-runs consumers reading that specific index. The navigation locked-page set is deduped by membership so consumers don't re-run when contents are unchanged.

## 0.0.9

### Patch Changes

- **Per-question `q.commit()` for widget-driven LMS writes.** New method on the `Question` handle: widgets signal a final answer and the interaction is reported then, not batched at submit. `useQuiz().submit()` still flushes any uncommitted question as a safety net. Idempotent. A learner closing the tab after the last commit now gets credit; previously the unsent batch was lost.

- **Adaptive interaction-id encoding per export.** Authors pass readable identifiers alongside the full option list (`options` for choice/sequencing, `optionPairs` for matching). cmi5 and SCORM 2004 ship the names through unchanged; SCORM 1.2 maps each name to its `options` index so SCORM Cloud's strict validator accepts it. Omit `options` and SCORM 1.2 falls back to slugging the literal identifier.

- **SCORM 1.2 strict-validator parity.** Interaction `id`s slug to `CMIIdentifier` (`q-1` → `q_1`). Field write order now matches the spec (`id` → `type` → `correct_responses.0.pattern` → `student_response` → `result` → `time`) — SCORM Cloud rejects `student_response` with a misleading type error if the pattern isn't declared first. choice/sequencing/matching responses are brace-wrapped per §3.4.7.7.5.

- **cmi5 resume safety.** The adapter seeds its lifecycle state from saved state at restore time so the LMS isn't re-spammed with Completed/Passed/Failed (and 403'd) on resume. Passed/Failed still re-emit on a real status transition.

- **cmi5 fetch-URL error handling.** When the LMS fetch URL responds with the spec-defined `{"error-code":...,"error-text":...}` shape (§8.2.3), `adapter.init()` throws with that code/text instead of stuffing the JSON blob into the `Basic` credential and 400-spamming the LRS.

- **Unified `Question` model across `useQuestion` and `useQuiz`.** Both hooks now traffic in the same per-question handle — no `getContext('tessera-quiz')`, no index tracking. New fields: `locked`, `isLockedCorrect`, `render`.

- **Empty-quiz warning suppressed when the page imports a custom widget.** Static analysis can't see widget registration through `useQuestion` in a custom component, so the runtime warning was a false positive in that case.

- **Vite dep-optimizer self-exclusion.** Prevents the plugin from pre-bundling itself when used inside the framework workspace.

## 0.0.8

### Patch Changes

- **Empty-quiz warning is now dev-only.** The `useQuiz` runtime warning about zero registered questions no longer runs in production builds — it is gated on `import.meta.env.DEV` so it only fires during development.

## 0.0.7

### Patch Changes

- **`tessera-validate` CLI.** New standalone bin that runs the project validation checks outside a dev server or build — a fast, scriptable feedback loop for authoring tools and agents. Prints errors/warnings and exits non-zero on errors.

- **Question-component and quiz-config validation.** Static checks now inspect `MultipleChoice` / `FillInTheBlank` / `Matching` / `Sorting` props — required props, correct-index ranges, parallel-array consistency, pair/answer shapes, and duplicate question ids — and verify `quiz.gatesProgress` / `quiz.showFeedback` are booleans. Previously only `pageConfig` object literals were inspected. Dynamic-expression props are skipped to avoid false positives.

- **LMS data-contract bypass detection.** Build-time: errors on direct `tessera-quiz-complete` dispatch and `tessera-learn/runtime/*` imports, warns on quiz pages with no questions. Runtime: dev warning when a quiz mounts with zero questions registered through `useQuestion` — the custom-widget path static analysis can't see.

## 0.0.6

### Patch Changes

- **SCORM 1.2 + 2004 spec-conformance pass against SCORM Cloud.** Several response-encoding and lifecycle paths were re-used unchanged across both dialects; the strict Rustici validator rejects the mismatch with 405 / 406. This split-and-tighten release: SCORM 1.2 uses plain `,` / `.` / `:` delimiters per §3.4.7 (not the bracketed 2004 form), `t`/`f` for `true-false`, and slugs response/correct identifiers to `CMIIdentifier` (alphanumeric + underscore) — raw labels like `"88 Earth days"` become `88_Earth_days`. SCORM 2004 applies the same slug rule for `short_identifier_type` and emits zone-free, second-resolution `cmi.interactions.n.timestamp` (`2026-05-12T00:32:28` per §5.3.3). All CMIDecimal writes round through `formatReal107` so fractional scores don't exceed `real(10,7)`.

- **SCORM 2004 catch-up with cmi5.** Reads `cmi.mode` on init and suppresses every learner-record write in `browse` / `review` launches (exposed via `getLaunchMode()`). Reads `cmi.scaled_passing_score` and `cmi.completion_threshold` (exposed via `getMasteryScore()` / `getCompletionThreshold()`); `App.svelte` lets the LMS-supplied mastery override `scoring.passingScore`. Writes `cmi.location` from `SavedState.b` and `cmi.progress_measure = 1` on completion. SCORM 1.2 gets the equivalent `cmi.core.lesson_location` write.

- **Manifest `xsi:schemaLocation`.** Both 1.2 and 2004 `imsmanifest.xml` now declare the IMS CP and ADL CP XSD pairs. Strict importers flag the absence.

- **Error logging parity with cmi5.** Every queued LMS write now carries the cmi key as context; retry give-up surfaces it alongside the code (`GetLastError`), message (`GetErrorString`), and the verbose diagnostic (`GetDiagnostic`, which SCORM Cloud uses to name the offending element). `LMSInitialize` failure, malformed `cmi.suspend_data`, non-numeric `cmi.interactions._count` (silent fallback to 0 would clobber prior session records), and terminate-path `Commit` / `LMSFinish` failures all log instead of failing silently.

## 0.0.5

### Patch Changes

- **cmi5 spec conformance against strict LRSes.** End-to-end validated against SCORM Cloud. The adapter now consumes the documents cmi5 actually requires and emits the statement shapes strict validators accept, replacing several heuristics that produced silent rejections in earlier versions.

  - **`LMS.LaunchData` (§10)** — fetched at init; `contextTemplate` is now the base context on every Defined Statement (§9.6.2). The Publisher Activity (`contextActivities.grouping`, §9.6.2.3) and session id extension (§9.6.3.1) come from there, not from heuristic URL parsing. `launchMode`, `returnURL`, `launchParameters`, `masteryScore`, and `moveOn` are also read from LaunchData and exposed via new getters: `getLaunchMode()`, `getReturnURL()`, `getLaunchParameters()`. LaunchData wins over the URL `masteryScore` parameter.
  - **Learner Preferences (§11)** — `cmi5LearnerPreferences` Agent Profile is fetched at startup _before_ Initialized, satisfying the §11 obligation strict LRSes enforce. Exposed via `getLearnerPreferences()`.
  - **`launchMode` (§10.2.2)** — Browse and Review launches now suppress every Defined Statement except Initialized and Terminated.
  - **`exit()` method (§10.2.6)** — new explicit-exit path. Calls `terminate()`, awaits the publisher queue so Terminated lands first, then `window.location.assign`s to the LMS-supplied `returnURL`.

  Spec-conformance fixes to lifecycle statement shapes:

  - **§9.6 Context Categories** — every Defined Statement now carries the `cmi5` Category Activity in `contextActivities.category`; Completed / Passed / Failed additionally carry the `moveOn` Category. Without these, conformant LRSes silently fail to roll up cmi5 lifecycle state.
  - **§9.5.1 score scope** — `result.score` is dropped from Completed (forbidden) and kept on Passed / Failed only.
  - **§9.6.3.2 masteryScore extension** — scoped to Passed / Failed only; previously emitted on every Defined Statement.
  - **§9.3.4 / §9.3.5 score-vs-mastery invariant** — a Passed with `scaled < masteryScore` or a Failed with `scaled >= masteryScore` would be non-conformant; the verb is preserved and the score is dropped (with a console warning).
  - **§9.3.9 Satisfied** — no longer emitted by the AU. Satisfied is an LMS-only verb; sending it from the AU triggers "origin of statement does not match request context" rejections.
  - **§9.3 Suspended** — no longer emitted. Suspended isn't in the cmi5 verb enumeration. Incomplete exits are signalled by Terminated without a preceding Completed; the LMS handles Abandoned (§9.3.6) and resume itself.
  - **§9.6.2 contextTemplate merge** — template-supplied categories are concatenated with the AU's required ones (never overwritten, per §10.2.1).

  cmi5 fetch / token plumbing:

  - **§11.2 auth-token parsing** — accepts the spec-conformant JSON body (`{"auth-token": "..."}`) in addition to the legacy plain-text form. Without this the Authorization header carried the entire JSON string, producing 400 "Malformed authorization header" on every authenticated call.

  Manifest (`cmi5.xml`) fixes:

  - `<au>` emits `<url>` as a child element (was an attribute) so the manifest passes the cmi5 CourseStructure XSD.
  - `<au>` emits a `launchMethod="AnyWindow"` attribute (required by the XSD).
  - `masteryScore` is rounded to 4 decimal places (§10.2.4) to avoid `0.7000000000000001` float drift.

  Operational visibility:

  - LRS non-2xx responses now surface the response body in the outcome's error message (capped at 500 chars) — debugging cmi5 rejections no longer requires snapshotting the network panel.
  - Every lifecycle statement (Initialized / Completed / Passed / Failed / Terminated / Answered) now logs a console warning on LRS rejection with the verb name and status. The previous `.catch(() => {})` path swallowed 4xx/5xx outcomes that the publisher resolves successfully.
  - State API GET / PUT and Agent Profile GET log meaningful non-2xx statuses (404 is silent on resume + prefs, since "no document" is normal).

## 0.0.4

### Patch Changes

- **Manual completion** — new `completion.mode: "manual"` lets authors own the moment of completion, either by declaring `pageConfig.completesOn: "view"` on a page or by calling `useCompletion().markComplete()` from any component. First-to-fire wins; the latch is monotonic and persists across resume. Optional `completion.trigger: "page"` opts into a build-time satisfiability check; `requireSuccessStatus: "passed" | "failed"` ties success status to the manual mark for compliance "acknowledge" flows. Behavior is identical across SCORM 1.2 / 2004 4th / cmi5 / web — no adapter changes.

  **SCORM suspend overflow / cmi5 mastery + moveOn** — SCORM adapters now warn when serialized `cmi.suspend_data` exceeds the spec cap (1.2: 4096; 2004: 64000) instead of silently truncating on the LMS side. cmi5 honors LMS-supplied `masteryScore` from the launch contract (overrides `scoring.passingScore` for the session) and respects the `moveOn` criterion when emitting Completed/Passed/Failed.

## 0.0.3

### Patch Changes

- Ship the MIT `LICENSE` file inside the package tarball. Previous versions declared `"license": "MIT"` in `package.json` but did not include the license text, which is required by the MIT terms and expected by license-auditing tools.

## 0.0.2

### Patch Changes

- **Custom widgets** — `useQuestion` gains a standalone-mode retry surface so authors of custom question widgets can build their own Try-Again UI on top of the hook (matching what the built-in widgets already do): `maxRetries` option, `retry()` method, and `canRetry`/`retryCount` getters on the returned handle. No-ops inside a `<Quiz>` (the parent quiz still drives retries there).

  **Sorting / Matching reactivity (Svelte 5)** — fix two bugs that survived the Svelte 4 → 5 migration:

  - Sorting placements were stored in a plain `Map` under `$state`; `.set` / `.delete` didn't trigger reactivity, so the UI only updated when adjacent reassignments happened to invalidate. Switched to `SvelteMap`.
  - Matching's auto-submit-on-final-pair was driven from a `$effect` reading derived state — moved into the match handler so it fires once when the final pair lands.

  **Sorting accessibility**

  - Drop targets are now keyboard-activatable: tab reaches each target, Enter/Space places the selected card. Previously keyboard users could select the deck card but had no way to drop it.
  - The deck card actually shows a focus ring now — the previous rule used `outline:` with a `box-shadow`-shaped value (`0 0 0 3px rgba(...)`), which is invalid syntax and was silently ignored.

  **Quiz feedback / retry policy** — `course.config.js`'s `quiz.feedbackMode` and `quiz.retryMode` accept author predicates in addition to the `'immediate'` / `'review'` / `'full'` / `'incorrect-only'` enum values: `feedbackMode: (state) => boolean` controls visibility per question on demand, and `retryMode: (results) => Set<number>` lets authors decide which questions stay locked on retry.

  **Internal refactors** (no API change for course authors): SCORM 1.2 / 2004 adapters share a base class; xAPI retry helpers are deduplicated; plugin pageConfig parsing and validation are unified; quiz components delegate state to the `useQuiz` hook so a custom `quiz.svelte` shell is more reliable.
