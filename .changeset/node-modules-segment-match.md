---
'tessera-learn': patch
---

A course inside a folder whose name contains `node_modules` or `virtual:` (such as `node_modules-demo/`) no longer skips the undefined-import build error and Svelte a11y warnings. Only a `node_modules` folder inside the project marks a file as a dependency.
