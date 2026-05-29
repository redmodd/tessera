---
'tessera-learn': minor
'create-tessera': minor
---

Consolidate commands. `tessera-learn` now ships a single `tessera` CLI with
`validate`, `a11y`, and `check` subcommands (replacing the separate
`tessera-validate` and `tessera-a11y` binaries). Scaffolded projects get a
`check` script (validate + accessibility audit) and the Playwright/axe-core
devDependencies needed to run it; install the browser once with
`pnpm exec playwright install chromium`.
