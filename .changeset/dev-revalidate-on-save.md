---
'tessera-learn': patch
---

`tessera dev` re-validates when a page or course file is saved or an asset is added or removed, reports any errors and new warnings, says when the errors are resolved, and no longer clears the terminal on reload. A dev server restart reports validation errors and no longer fails on them. A source file saved twice within one timestamp tick is no longer read stale, and a dangling or looping symlink under `pages/` is skipped with a warning instead of crashing validation. While `course.config.js` cannot be read, validation leaves out the accessibility diagnostics that `a11y.ignore` and `a11y.level` decide.
