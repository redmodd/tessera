---
'tessera-learn': patch
---

A course inside a folder whose name contains `node_modules` (such as `node_modules-demo/`) no longer skips the undefined-import build error and Svelte a11y warnings. Only a real `node_modules` path segment marks a file as a dependency.
