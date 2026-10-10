---
'tessera-learn': patch
---

`tessera export` now packages the `course.config.js` that passed validation, even if the file changes during the build. `tessera dev` re-validates when `course.config.js` or `course.runtime.js` changes, reports any errors and says when they are resolved, and no longer clears the terminal on reload. A source file saved twice within one timestamp tick is no longer read stale.
