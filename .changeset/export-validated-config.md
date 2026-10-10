---
'tessera-learn': patch
---

`tessera export` now packages the `course.config.js` that passed validation, even if the file changes during the build, and `tessera a11y` audits with the settings its build validated. `tessera dev` re-validates when a page or course file is saved, reports any errors and new warnings, says when the errors are resolved, and no longer clears the terminal on reload. A source file saved twice within one timestamp tick is no longer read stale, and a dangling symlink under `pages/` no longer crashes validation.
