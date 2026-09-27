---
'tessera-learn': patch
---

In dev, the page manifest reloads only when a change under `pages/` alters it, and adding or removing a stylesheet in `styles/` reloads. Edits to pages, stylesheets, `layout.svelte`, `quiz.svelte` and `course.runtime.js` stay on HMR.
