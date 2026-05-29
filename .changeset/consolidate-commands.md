---
'tessera-learn': minor
'create-tessera': minor
---

The `tessera-validate` and `tessera-a11y` binaries are now one `tessera` CLI
with `validate`, `a11y`, and `check` subcommands. Scaffolded projects gain a
`check` script plus the Playwright/axe-core dev dependencies it needs — run
`pnpm exec playwright install chromium` once to install the browser. New
projects are now set up for pnpm (`packageManager` is pinned, so corepack
provisions it), which shares one package store across all your courses instead
of a full copy per project.
