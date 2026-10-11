---
'tessera-learn': patch
---

`tessera dev` re-validates when a page or course file is saved, or when a page folder or an asset is added or removed. Errors print on each save, new warnings print once, and it says when the errors are resolved. The terminal is no longer cleared on reload, so the messages stay on screen.

A dev server restart reports validation errors and no longer fails on them.

A dangling or looping symlink under `pages/` is skipped instead of crashing validation, with a warning when it would have been part of the course. A source file saved twice in quick succession is no longer read stale. While `course.config.js` cannot be read, validation leaves out the accessibility diagnostics that `a11y.ignore` and `a11y.level` decide.
