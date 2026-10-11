---
'tessera-learn': patch
---

`tessera export` now packages the `course.config.js` that passed validation, even if the file changes during the build. `tessera a11y` and `tessera check` scan with the `a11y` settings their build validated.
