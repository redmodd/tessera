---
'tessera-learn': minor
'create-tessera': minor
---

**Workspaces: one project, many courses.** `npm create tessera` now scaffolds a _workspace_ — a single package (`package.json` + `node_modules`) that holds many courses under `courses/<name>/` and a `shared/` design system imported as `$shared`. Each course still exports independently to its own SCORM 1.2 / SCORM 2004 4e / cmi5 / web package.

- New `tessera new <name>` subcommand stamps a course into `courses/<name>/` (no install — the workspace owns the dependencies).
- `dev` / `export` / `validate` / `a11y` / `check` take an optional course name (`tessera dev <name>`), or run bare from inside a course folder. A bare command at the workspace root lists the available courses rather than guessing.
- New `$shared` alias resolves to the workspace `shared/` directory in dev and is bundled into every export.

**Breaking:** the standalone single-course project layout is no longer scaffolded or supported as a runtime shape; the workspace is the only shape going forward. Pre-1.0, so this ships as a `minor` (0.x).
