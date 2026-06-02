---
'tessera-learn': minor
'create-tessera': minor
---

**New `tessera duplicate <source> <new>` subcommand.** Copies `courses/<source>/` to `courses/<new>/` within the workspace, skipping build artifacts (`dist/`, `a11y-report.json`, `node_modules/`, Vite/a11y caches). The copy is verbatim — the course config (including its `title`) is carried over untouched, and the command prints a reminder to update the title. Refuses to overwrite an existing course; reuses the same workspace, name-validation, and not-found messages as the rest of the CLI.
