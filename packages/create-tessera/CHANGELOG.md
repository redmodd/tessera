# create-tessera

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
