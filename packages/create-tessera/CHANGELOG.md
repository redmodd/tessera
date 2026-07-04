# create-tessera

## 0.4.1

### Patch Changes

- 30ac0a6: tessera-learn 0.4.0 -> 0.4.1

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

- 78abd9d: Scaffolded workspaces now derive their Svelte pin from `tessera-learn` at build time (the two release in lockstep), so the pin can't drift when `tessera-learn`'s Svelte dependency is bumped.
- cd6595c: Declare publish provenance via `publishConfig` so it survives the pnpm 11 upgrade.
- dfe4818: Scaffolded workspaces pin Svelte `^5.56.2`, matching the version `tessera-learn` ships.

## 0.2.2

### Patch Changes

- 455a7d4: Scaffolded workspaces now include a human-facing `README.md` and a "Project notes" section in `AGENTS.md` where users add their own context for the agent.

## 0.2.1

### Patch Changes

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
- Internal: dependency bumps (including Svelte 5.56), a doc-anchor fix, and CodeQL/CI cleanup — no API or behavior changes.

## 0.0.13

### Patch Changes

- 1edf88f: **Accessibility checker** — a three-tier system for catching a11y issues, plus the component and config changes to support it.
  - **Components.** `Image` now requires either `alt` or the new `decorative` flag (was silently optional). `Video`/`Audio` require a `title` and accept `tracks` (rendered as `<track>`) and a `transcript` disclosure. A new top-level `language` config field (BCP-47, default `'en'`) sets `<html lang>`.
  - **Static analyzer** (build + dev, no new deps). Routes Svelte's `a11y_*` compiler warnings through the validation reporter, plus tessera-specific rules for missing alt/title/captions, empty question labels, skipped heading levels, low `primaryColor` contrast, and malformed `language` tags.
  - **Runtime auditor.** New `tessera-a11y` bin runs Playwright + axe-core over a built course, writes `a11y-report.json`, and exits non-zero above an impact threshold (default `serious`). Playwright and `@axe-core/playwright` are optional.
  - **Config.** New `a11y` block: `level` (`warn`/`error`), `standard` (axe ruleset tags), and `ignore` (per-rule escape hatch).
  - **Scaffold.** New courses ship `language: 'en'` and a reserved `accessibility-check` script (→ `tessera-a11y`); `upgrade` adds it to existing projects.
  - **Fix.** `$assets/` references with a Vite query suffix (`?raw`, `?url`) are no longer mis-reported as missing.

- 28cdba8: Pin scaffolded and upgraded `tessera-learn` to the exact version create-tessera ships, derived from its own version rather than a hand-maintained `tesseraVersion` field. The two packages now release in lockstep, so the pinned runtime can't drift from what was published.
- d4e0351: Move scaffolder templates from inline strings to real on-disk template directories copied by a token-substituting walker, and make the post-scaffold "Next steps" hint package-manager-aware (npm/pnpm/yarn/bun). Mostly internal, but scaffolded output changes slightly: the bare template's demo question now uses the documented choice pattern (readable ids + `options`, so SCORM 1.2 export emits the position indexes SCORM Cloud requires), and the README/AGENTS.md note that `npm` commands can be swapped for your package manager.

## 0.0.12

### Patch Changes

- 909863b: - Bump the scaffolded `tessera-learn` pin to `^0.0.11` so newly-created projects pick up the standalone-question LMS score fix, consistent `$assets/` resolution across the media components, and the relocated framework bundle (`dist/tessera/`).
  - Pin `"types": ["node"]` in the package tsconfig so a standalone `tsc -p packages/create-tessera/tsconfig.json` type-checks clean (it was reporting phantom missing-`process` / `node:*` errors). No change to the scaffolded output or CLI behavior.

## 0.0.11

### Patch Changes

- - Bump the scaffolded `tessera-learn` pin to `^0.0.10` so newly-created projects pick up the CSS extraction + tree-shaking, adapter/xAPI gating, first-page preload, no-flash navigation, and next-page prefetch.

## 0.0.10

### Patch Changes

- Bump the scaffolded `tessera-learn` pin to `^0.0.9` so newly-created projects pick up the per-question `q.commit()` API, adaptive interaction-id encoding (readable ids preserved on cmi5/SCORM 2004, mapped to indexes on SCORM 1.2), the SCORM 1.2 strict-validator fixes (id slugging, field write order, brace-wrapped responses), and the cmi5 resume / fetch-URL fixes.

## 0.0.9

### Patch Changes

- **`create-tessera upgrade` command.** Re-applies framework-owned files to an existing project: merges the reserved npm scripts (`dev`, `export`, `validate`) into `package.json`, applies the `preview`→`dev` rename migration, pins `tessera-learn` to the version this CLI ships, and overwrites `AGENTS.md` and `vite.config.js`. Authored files (`course.config.js`, `pages/`, `styles/`, `layout.svelte`, `README.md`) are never touched. A reserved script whose value has been customised is left alone with a warning. Supports `--dry-run` to preview changes without writing.

- Bump the scaffolded `tessera-learn` pin to `^0.0.8`.

## 0.0.8

### Patch Changes

- Bump the scaffolded `tessera-learn` pin to `^0.0.7` so newly-created projects pick up the `tessera-validate` CLI and the expanded question-component / quiz-config validation.
- Add a `validate` npm script (runs `tessera-validate`) to both templates as the fast post-edit feedback loop, documented in AGENTS.md.
- Scaffold `assets/` and `styles/` folders in the bare template — previously omitted despite AGENTS.md documenting them as part of the project structure.
- Rename the scaffolded `preview` script to `dev`. `preview` collided with Vite's convention, where `vite preview` serves a production build — the opposite of starting a dev server.

## 0.0.7

### Patch Changes

- Bump the scaffolded `tessera-learn` pin to `^0.0.6` so newly-created projects pick up the SCORM 1.2 / 2004 spec-conformance pass.

## 0.0.6

### Patch Changes

- Bump the scaffolded `tessera-learn` pin to `^0.0.5` so newly-created projects pick up the cmi5 spec-conformance fixes (LMS.LaunchData / Learner Preferences consumption, launchMode gating, returnURL + `adapter.exit()`, removal of AU-emitted Satisfied / Suspended, §9.6 Context Categories, score-scope and masteryScore-extension corrections, manifest `<url>` element + `launchMethod` attribute).

## 0.0.5

### Patch Changes

- Bump the scaffolded `tessera-learn` pin to `^0.0.4` so newly-created projects pick up the latest published runtime (manual completion mode and the SCORM/cmi5 adapter fixes).

## 0.0.4

### Patch Changes

- Ship the MIT `LICENSE` file inside the package tarball. Previous versions declared `"license": "MIT"` in `package.json` but did not include the license text, which is required by the MIT terms and expected by license-auditing tools.
- Bump the scaffolded `tessera-learn` pin to `^0.0.3` so newly-created projects pick up the latest published runtime.

## 0.0.3

### Patch Changes

- Update the README on npm: add the AI-authoring framing for the project, correct the description of what the `default` vs. `bare` templates scaffold (the previous list was inaccurate), and tidy the CLI flags table (`--help`, `-h`).
- Bump the scaffolded `tessera-learn` pin to `^0.0.2` so newly-created projects pick up the latest published runtime.

## 0.0.2

### Patch Changes

- 7c9d7a5: Pin the scaffolded `tessera-learn` dependency to `^0.0.1` to match the actually-published version. Previously the scaffolder wrote `^0.1.0`, which has no matching release on npm and caused `npm install` to fail in newly-created projects.
