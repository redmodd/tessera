# create-tessera

## 0.0.13

### Patch Changes

- 1edf88f: Add an accessibility checker spanning three non-overlapping tiers, plus the
  component and config changes that make an accessible result expressible.

  **Tier 0 — components correct by construction.**
  - `Image` — `alt` is no longer silently optional; add a `decorative` boolean so
    "forgot alt" is distinguishable from "intentionally ornamental" (renders empty
    `alt` + `aria-hidden`).
  - `Video` / `Audio` — `title` (the accessible name) is required; add `tracks`
    (rendered as `<track>` on native players) and `transcript` (a `<details>`
    disclosure).
  - `<html lang>` — new top-level `language` config field (BCP-47, default `'en'`)
    interpolated into the generated HTML instead of a hardcoded `lang="en"`.

  **Tier 1 — static analyzer (build + dev, zero new runtime deps).**
  - _1a_ routes the Svelte compiler's `a11y_*` warnings (filtered to author files)
    through the validation reporter and gates them at `buildEnd`.
  - _1b_ adds tessera-specific rules: `<Image>` alt-or-decorative, `<Video>`/
    `<Audio>` title + captions/transcript, empty question option/answer labels,
    skipped heading levels, `branding.primaryColor` contrast against white, and a
    well-formed `language` tag.

  **Tier 2 — runtime auditor.** New `tessera-a11y` bin drives Playwright + axe-core
  over every page of a built course, writes `a11y-report.json`, and exits non-zero
  on violations at/above an impact threshold (default `serious`). Playwright and
  `@axe-core/playwright` are optional — the command exits with an actionable
  message when they're absent, so the static gate carries no new dependency.

  **Config.** New `a11y` block: `level` (`warn` | `error`, promotes the heuristic
  rules and 1a), `standard` (axe ruleset tags), and `ignore` (a flat per-rule
  escape hatch matched literally against each diagnostic's ID across all tiers).

  The scaffolded `course.config.js` now ships `language: 'en'` so fresh courses
  start clean, and the scaffold adds a reserved `accessibility-check` npm script
  (→ `tessera-a11y`) alongside `dev` / `export` / `validate`; `upgrade` reconciles
  it into existing projects.

  **Fix.** `$assets/` references carrying a Vite query/hash suffix (e.g. `?raw`,
  `?url`) are no longer mis-reported as "not found" by the asset-reference
  validator — the suffix is stripped before the on-disk existence check.

- 28cdba8: Pin scaffolded and upgraded `tessera-learn` to the exact version create-tessera
  ships at, derived from the package's own version, instead of a hand-maintained
  `tesseraVersion` field. create-tessera and tessera-learn now release in lockstep
  (changesets `fixed`), so the pinned runtime version always matches what was
  published and cannot drift.
- d4e0351: Move scaffolder templates from inline string literals to real on-disk template
  directories (`templates/base`, `templates/default`, `templates/bare`) copied by a
  token-substituting walker, and make the post-scaffold "Next steps" hint
  package-manager-aware (npm/pnpm/yarn/bun via `npm_config_user_agent`).

  Mostly an internal refactor, but scaffolded projects also change in two small
  ways: the bare template's demo check question now follows the documented choice
  pattern (readable ids + `options`, so SCORM 1.2 export emits the position indexes
  SCORM Cloud's strict validator requires), and the scaffolded README/AGENTS.md now
  note that the `npm` run commands can be swapped for your package manager.

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
