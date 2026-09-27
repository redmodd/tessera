---
'tessera-learn': patch
---

A course inside a folder whose name contains `node_modules` or `virtual:` (such as `node_modules-demo/`) no longer skips the undefined-import build error and Svelte a11y warnings. Only a `node_modules` folder inside the project marks a file as a dependency.

Svelte a11y warnings from a build run at the workspace root (`pnpm export <course>`) now show course-relative paths, and `$shared` components are no longer reported or gated as course files, matching a build run from the course folder.
