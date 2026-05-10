# tessera-learn

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
