---
'tessera-learn': patch
'create-tessera': patch
---

Make the `tessera` CLI's invocation guidance accurate for a project-local bin. The `tessera validate` hint now points at `pnpm exec tessera a11y` (bare `tessera a11y` isn't on PATH), and scaffolded projects gain an `a11y` script so the runtime audit is runnable as `pnpm a11y`.
