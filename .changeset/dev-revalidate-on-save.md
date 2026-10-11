---
'tessera-learn': patch
---

`tessera dev` now re-validates as you work, where it used to validate once at startup. It runs when a page or course file is saved, or when a page folder or an asset is added or removed. Errors print on each save, new warnings print once, and it says when the errors are resolved. The terminal is no longer cleared on reload, so the messages stay on screen.

A dev server restart reports validation errors and no longer fails on them.

A dangling or looping symlink under `pages/` is skipped instead of crashing validation, with a warning when it would have been part of the course.
