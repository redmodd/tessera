---
'tessera-learn': patch
---

`tessera export` now packages the `course.config.js` that passed validation, even if the file changes during the build. `tessera dev` re-validates when `course.config.js` or `course.runtime.js` changes and reports any errors.
