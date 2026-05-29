---
'tessera-learn': minor
'create-tessera': minor
---

The `tessera-validate` and `tessera-a11y` binaries are now one `tessera` CLI
with `validate`, `a11y`, and `check` subcommands. Scaffolded projects gain a
`check` script plus the Playwright/axe-core dev dependencies it needs — run
`pnpm exec playwright install chromium` once to install the browser.
