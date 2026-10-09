---
'tessera-learn': patch
---

`tessera export` now packages the `course.config.js` that passed validation, even if the file changes during the build. `tessera dev` re-validates `course.config.js` when it changes and reports any errors.
