# tessera-learn

## 0.5.2

### Patch Changes

- c2985c8: chore(deps): bump vite from 8.2.1 to 8.2.2
- b16dde8: chore(deps-dev): bump @types/node from 26.2.0 to 26.4.0 and svelte from 5.56.10 to 5.57.0
- f042e8a: Skip export packaging and the asset copy when the build fails, including a failed `build --watch` rebuild, so a failed run leaves the previous zip in place.
- e377126: Persist state changed during adapter init instead of dropping it.
- 86c8cf5: Persist quiz attempts and results across sessions, recording the best attempt rather than the last, and load xAPI/cmi5 resume state separately from adapter init so an unreachable State API costs the bookmark rather than the launch.
- 8286c09: Fix fill-in-the-blank answers with surrounding whitespace showing as correct while scoring as wrong, make question widgets read correctness from the runtime instead of recomputing it, and fix standalone fill-in-the-blank, matching, and sorting questions that could not be submitted.
- 33514c9: The built-in quiz shell now renders page content instead of hiding it along with the question widgets.
- c89a1e2: Report a quiz answer when it becomes final (immediate-mode reveal, or submit) rather than on the option click, gate submit on every answer being fully built, and label the quiz nav buttons for what the click does. An abandoned attempt in review/never mode now leaves no interaction records, and standalone `useQuestion` reports `answerComplete: false` until an answer is set.
- dafad66: Give each quiz page its own quiz shell. Adjacent quiz pages previously shared one engine, so the second page inherited the first page's submitted state, config and questions.
- 0288f2b: Fix the quiz submit guard order, the results pass label, and duplicate question ids.
- fa45a57: Reject a saved resume document that can't be restored faithfully, so a partially-applied restore can't report a bogus completion to the LMS
- 97e11b4: Report fill-in correct responses faithfully: one pattern per acceptable answer, a `{case_matters=true}` prefix on each SCORM 2004 and xAPI pattern, and the SCORM RTE pattern caps applied only where they exist.
- 7157199: Re-derive course completion and success status when a standalone question rescores.
- 906ff51: Validate the plugin's `standardOverride` option against the allowed export standards.
- 172ecb8: Reshape Person-shaped xAPI/cmi5 launch actors into a valid Agent instead of forwarding them to the LRS.
  Reject a non-`Agent` `objectType` on a static `xapi.actor` at build time.
  Fail the launch with a launch-parameter error when the LMS actor has no usable IFI, instead of a misleading `xapi.actor` config error.
- e02e8fc: Treat `xapi.endpoint: 'lms'` as an ignored entry with a build warning under scorm12/scorm2004/web, and skip the xAPI runtime when it is the only entry, so one course config exports to every standard.

## 0.5.1

### Patch Changes

- 15357a3: chore(deps): bump acorn from 8.17.0 to 8.18.0
  
  `tessera-learn`:
  
  - `acorn` 8.17.0 → 8.18.0
- c7063dd: chore(deps): bump vite from 8.1.5 to 8.2.1
  
  `tessera-learn`:
  
  - `vite` 8.1.5 → 8.2.1
- 541e37d: chore(deps): bump @sveltejs/acorn-typescript from 1.0.11 to 1.0.13
  
  `tessera-learn`:
  
  - `@sveltejs/acorn-typescript` 1.0.11 → 1.0.13
- a90dd4c: chore(deps): bump @sveltejs/vite-plugin-svelte from 7.2.0 to 7.3.0
  
  `tessera-learn`:
  
  - `@sveltejs/vite-plugin-svelte` 7.2.0 → 7.3.0
- 133f208: chore(deps-dev): bump the dev-dependencies group across 1 directory with 15 updates
  
  `create-tessera`:
  
  - `@types/node` 26.1.1 → 26.2.0
  - `@vitest/coverage-v8` 4.1.10 → 4.1.11
  - `vitest` 4.1.10 → 4.1.11
  
  `tessera-learn`:
  
  - `@types/node` 26.1.1 → 26.2.0
  - `@vitest/coverage-v8` 4.1.10 → 4.1.11
  - `jsdom` 29.0.1 → 30.0.1
  - `scorm-again` 3.2.0 → 3.3.0
  - `svelte-check` 4.7.3 → 4.7.6
  - `svelte` 5.56.8 → 5.56.10
  - `vitest` 4.1.10 → 4.1.11
- 22158ad: Cover SCORM 2004 `total_time` accumulation across a relaunch in the conformance suite.
- 77a8bd3: Correct stale commands, paths, and links in the package docs.

## 0.5.0

### Minor Changes

- 9d7ec59: `svelte` is now a peer dependency (`^5.56.0`) rather than a direct dependency, so a project resolves exactly one copy. Scaffolded projects already declare it; others need `pnpm add -D svelte`.

### Patch Changes

- 3c16807: chore(deps-dev): bump the dev-dependencies group across 1 directory with 9 updates

  `create-tessera`:

  - `tsdown` 0.22.9 → 0.22.14

  `tessera-learn`:

  - `scorm-again` 3.0.5 → 3.2.0
  - `svelte` 5.56.6 → 5.56.8
  - `tsdown` 0.22.9 → 0.22.14

  `scorm-again` 3.1.0 corrected the SCORM 1.2 out-of-range score error to 405 (407 is not in the 1.2 RTE error table), so the conformance test asserts 405.

- a6c32a3: Remove redundant internal indirection; WriteQueue now warns on final-retry throws.

## 0.4.3

### Patch Changes

- 4243160: chore(deps): bump @sveltejs/vite-plugin-svelte from 7.1.2 to 7.2.0
- d407370: chore(deps): bump @sveltejs/acorn-typescript from 1.0.10 to 1.0.11
- 8b7cf3e: chore(deps): bump vite from 8.1.3 to 8.1.5
- 0e8a9d2: chore(deps): bump svelte from 5.56.4 to 5.56.6
- d970ea7: chore(deps-dev): bump the dev-dependencies group across 1 directory with 9 updates

  `create-tessera`:

  - `@types/node` 26.1.0 → 26.1.1
  - `@vitest/coverage-v8` 4.1.9 → 4.1.10
  - `tsdown` 0.22.3 → 0.22.9
  - `vitest` 4.1.9 → 4.1.10

  `tessera-learn`:

  - `@types/node` 26.1.0 → 26.1.1
  - `@vitest/coverage-v8` 4.1.9 → 4.1.10
  - `svelte-check` 4.7.1 → 4.7.3
  - `tsdown` 0.22.3 → 0.22.9
  - `vitest` 4.1.9 → 4.1.10

## 0.4.2

### Patch Changes

- 4c8e174: chore(deps-dev): bump @types/node from 26.0.1 to 26.1.0
- fb5f09b: chore(deps): bump vite from 8.1.0 to 8.1.3

## 0.4.1

### Patch Changes

- 799edea: chore(deps-dev): bump the dev-dependencies group with 9 updates

  - `@axe-core/playwright` 4.11.3 → 4.12.1
  - `@playwright/test` 1.61.0 → 1.61.1
  - `eslint` 10.5.0 → 10.6.0
  - `eslint-plugin-svelte` 3.19.0 → 3.20.0
  - `globals` 17.6.0 → 17.7.0
  - `prettier` 3.8.4 → 3.8.5
  - `typescript-eslint` 8.61.1 → 8.62.0
  - `@types/node` 26.0.0 → 26.0.1
  - `svelte-check` 4.6.0 → 4.7.1

- 799edea: chore(deps): bump svelte from 5.56.3 to 5.56.4
- 799edea: chore(deps): bump vite from 8.0.16 to 8.1.0

## 0.4.0

### Minor Changes

- db4c3a3: Add `--standard <web|scorm12|scorm2004|cmi5|xapi>` to `tessera export` and `tessera validate` to override `course.config.js` export.standard for a single build.
- 208cfc1: Add a `resume: 'auto' | 'never'` option; `'auto'` discards saved progress when the page structure changed.

### Patch Changes

- c54a2e0: Centralize export-standard resolution behind a single `readResolvedConfig` helper (no user-facing change).
- 9f28e18: Internal refactor of the SCORM adapters and xAPI publisher; no behavior change.
- 71205a0: Internal refactor of the project validator to a single diagnostics collector; no behavior change.

## 0.3.0

### Minor Changes

- dd0da8d: Add a generated course `id` that uniquely keys web localStorage and the cmi5/xAPI activity id, with a page-structure fingerprint so reorders don't restore stale state.
- fa546cc: Add xAPI 1.0.3 (`export.standard: 'xapi'`) as a plain Tin Can launch package.

### Patch Changes

- e82ffe5: Add `export.csp` to extend the web-export Content-Security-Policy per-directive (or `false` to disable it).
- 5d495af: Fix non-ASCII course/page titles shipping as mojibake, add a baseline CSP to web exports, and trim a syscall per file in export packaging.
- e7a2794: Share one fail-loud LMS error across the runtime and build-time adapter selectors, and cache JS-module parses in the build pipeline.
- 385f41e: Fix sidebar section collapse and the "Untitled Course" fallback for empty titles, trim empty keys from suspend_data, and pin scaffolded workspaces to pnpm 11.5.2.

## 0.2.3

### Patch Changes

- 8325e6f: `tessera a11y`/`tessera check` always rebuild before auditing (the `--build` flag is removed), and `tessera validate`'s accessibility tip now points at the working `pnpm a11y <course>` command.
- 6ace627: Condense the course authoring guide for tighter LLM context without dropping any contract detail.
- cd6595c: Declare publish provenance via `publishConfig` so it survives the pnpm 11 upgrade.

## 0.2.2

### Patch Changes

- 663357a: `tessera a11y` / `tessera check` now auto-install Chromium for Playwright on first use instead of failing with a manual instruction.
- fc41b00: a11y audit now reports which element triggered each violation: `a11y-report.json` records the selector, HTML, and axe's failure summary per node, and the console output lists the offending selector and failure summary.
- ba866d1: Rewrite the course authoring guide (`AGENTS.md`) into a procedural, LLM-facing instruction set — converting prose to rules/tables and trimming runtime-internal reference that authors never write.
- 701a18d: Internal refactor with no author-facing changes: the four question widgets now share a `QuestionShell` component for their standalone-vs-quiz render, and the LMS adapter labels and cmi5 context builder were de-duplicated.
- 7978096: A course directory under `courses/` that has a `pages/` folder but is missing its `course.config.js` is now reported as skipped when listing the workspace's courses, instead of being silently dropped.

## 0.2.1

### Patch Changes

- 1ddd286: `tessera a11y` now audits every page of a course that uses a custom `layout.svelte`, instead of silently scanning only the entry page and reporting a pass. A page that fails to load at runtime is flagged in the report and fails the audit, rather than being scanned as an accessible error screen.
- eac739d: Scaffolded root scripts now pass through to the CLI (`tessera dev`) instead of hardcoding the seed course. `pnpm dev <course>` runs the course you name, and a bare `pnpm dev` lists the available courses rather than silently running the seed.

## 0.2.0

### Minor Changes

- a60b5bb: **Workspaces: one project, many courses.** `npm create tessera` now scaffolds a _workspace_ — a single package that holds many courses under `courses/<name>/`, sharing one `node_modules` and a `shared/` design system imported as `$shared` (resolved in dev, bundled into each export). Every course still exports independently to its own SCORM 1.2 / SCORM 2004 4e / cmi5 / web package.
  - `tessera new <name>` stamps a new course; `tessera duplicate <source> <new>` copies an existing one verbatim (config and title included).
  - `dev` / `export` / `validate` / `a11y` / `check` take an optional course name (`tessera dev <name>`), or run bare from inside a course folder; a bare command at the workspace root lists the available courses instead of guessing.

  **Breaking:** the standalone single-course layout is no longer scaffolded or supported — the workspace is the only shape going forward. Pre-1.0, so this ships as a `minor` (0.x).

### Patch Changes

- 5f18964: Correct the `tessera` CLI's invocation hints and docs for a project-local bin, and add an `a11y` script to scaffolded projects (`pnpm a11y`).

## 0.1.0

### Minor Changes

- 8ff7039: The `tessera-validate` and `tessera-a11y` binaries are now one `tessera` CLI with `validate`, `a11y`, and `check` subcommands; new projects are set up for pnpm (run `pnpm exec playwright install chromium` once to enable the browser-backed `check`/`a11y` audit).
- 09314ec: The `tessera` CLI now owns the build — `tessera dev` / `tessera export` run Vite programmatically, so scaffolded projects no longer carry `vite.config.js` or a `vite` devDependency (add an optional `tessera.config.js` to customise), and the `create-tessera upgrade` command is gone (update a course with `pnpm add tessera-learn@latest`). The authoring guide now ships inside `tessera-learn` at `node_modules/tessera-learn/AGENTS.md`, with `CLAUDE.md` / `AGENTS.md` pointer stubs in scaffolded projects.

  **Migrating a project scaffolded before this release:** swap the npm scripts to `tessera dev` / `tessera export` / `tessera validate` / `tessera check`, drop `vite` and `@sveltejs/vite-plugin-svelte` from `devDependencies`, and delete `vite.config.js`.

### Patch Changes

- df7b48b: Fix flat-shape courses (`.svelte` pages directly inside a section directory) rendering no pages: manifest generation and validation now share one page walker.
- 9020eeb: The build-time validator now catches cases the old regex scanner skipped — components carrying a `:` directive (`class:`/`bind:`/`transition:`) and unparseable Svelte — and no longer false-matches commented-out or string-embedded tags.
- Internal: dependency bumps (including Svelte 5.56), test hardening and dedup, runtime refactors, a doc-anchor fix, and CodeQL/CI cleanup — no API or behavior changes.

## 0.0.13

### Patch Changes

- 1edf88f: **Accessibility checker** — a three-tier system for catching a11y issues, plus the component and config changes to support it.
  - **Components.** `Image` now requires either `alt` or the new `decorative` flag (was silently optional). `Video`/`Audio` require a `title` and accept `tracks` (rendered as `<track>`) and a `transcript` disclosure. A new top-level `language` config field (BCP-47, default `'en'`) sets `<html lang>`.
  - **Static analyzer** (build + dev, no new deps). Routes Svelte's `a11y_*` compiler warnings through the validation reporter, plus tessera-specific rules for missing alt/title/captions, empty question labels, skipped heading levels, low `primaryColor` contrast, and malformed `language` tags.
  - **Runtime auditor.** New `tessera-a11y` bin runs Playwright + axe-core over a built course, writes `a11y-report.json`, and exits non-zero above an impact threshold (default `serious`). Playwright and `@axe-core/playwright` are optional.
  - **Config.** New `a11y` block: `level` (`warn`/`error`), `standard` (axe ruleset tags), and `ignore` (per-rule escape hatch).
  - **Scaffold.** New courses ship `language: 'en'` and a reserved `accessibility-check` script (→ `tessera-a11y`); `upgrade` adds it to existing projects.
  - **Fix.** `$assets/` references with a Vite query suffix (`?raw`, `?url`) are no longer mis-reported as missing.

- 64bc37c: Fix correctness issues surfaced by new static analysis: four unhandled promises in async LMS/runtime work (cmi5 State PUT, the write-queue flush, ZIP finalize, page prefetch) are now explicitly fire-and-forget (behavior unchanged); cmi5 launch-parameter errors attach the underlying error via `cause`; and `<AccordionItem>` derives its element ids from `$props.id()` instead of a module-level counter. Also adds monorepo type-checking, ESLint, and Prettier (internal tooling). No public API change.

- 4e69ce8: Internal: extract `QuizEngine` from the `useQuiz` closure into a standalone, DOM-free class. No public API or behavior change.
- cc638d6: Close build-time validation gaps so authors get a diagnostic instead of silent misbehavior:
  - **`quiz.feedbackMode` / `quiz.retryMode`** — enum-checked; catches typos that previously fell through to the default.
  - **`title`** — warns when missing or empty, errors when non-string.
  - **Question `weight`** — warns when ignored or coerced; errors on a non-finite value that would make the score `NaN`.
  - **Question `id` (SCORM 1.2)** — warns when sanitization would rewrite it, errors on a post-sanitization collision.
  - **`MultipleChoice.optionFeedback`** — warns when it has more entries than `options`.
  - **`scoring.passingScore`** — warns when `completion.mode: "quiz"` leaves it at the implicit default (70%).
  - **`branding`** — warns on a malformed `logo`, `primaryColor`, or `fontFamily`.
  - **Empty sections** — warns when a section contributes no pages.

## 0.0.11

### Patch Changes

- 909863b: - **Standalone graded questions now count toward the LMS score.** A course graded entirely through standalone `useQuestion({ graded: true })` previously reported `success_status` but never called `adapter.setScore`, leaving `cmi.score.raw` unset; the score and success status could also disagree when both quizzes and standalone questions existed. Both are now derived from one source (`ProgressState.gradedScore()`), and the score-reporting effect commits only when the rounded score actually changes — so page turns no longer re-issue redundant `setScore` / `setDuration` / `commit()` round-trips.
  - **Consistent `$assets/` resolution in media components.** `Image`, `Audio`, and `Video` now resolve `src` through the shared `resolveAsset()` helper using one document-relative `./assets/` form that works at the domain root, under an LMS subpath, and over `file://`. Previously `Image` used a root-relative `/assets/` prefix and `Audio` / `Video` emitted the literal `$assets/` URL unresolved. A missing/empty `src` renders an empty `<source>` instead of throwing.

  - **Framework bundle emitted to `dist/tessera/`.** Vite's hashed JS/CSS chunks now live in `dist/tessera/`, leaving `dist/assets/` for user media only, so a host can apply an immutable long-cache rule to the bundle without risking stale media. No author-facing change — courses keep referencing media via `$assets/...`.

  Also includes a series of internal refactors (config read/parse, shared validation/auth-credential rules, adapter cleanup, plugin restructuring) with no change to runtime behavior.

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
