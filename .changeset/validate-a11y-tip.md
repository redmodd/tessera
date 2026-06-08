---
'tessera-learn': patch
---

`tessera validate` now points at a command that works in a scaffolded workspace: its accessibility tip prints `pnpm a11y <course>` (the project's own script, with the course name) instead of `pnpm exec tessera a11y`, which failed at the workspace root because no course was named.
