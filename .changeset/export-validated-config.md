---
'tessera-learn': patch
---

`tessera export` now packages the `course.config.js` that passed validation, even if the file changes during the build. `tessera dev` re-validates when a page or course file is saved or an asset is added or removed, reports any errors and new warnings, says when the errors are resolved, and no longer clears the terminal on reload. A dev server restart reports validation errors and no longer fails on them. A source file saved twice within one timestamp tick is no longer read stale, and a dangling or looping symlink under `pages/` no longer crashes validation.
