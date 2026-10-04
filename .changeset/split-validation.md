---
'tessera-learn': patch
---

`tessera validate --standard` now applies that standard to page checks even when `course.config.js` does not parse.

`tessera validate` now rejects an unknown `chrome` value in `course.config.js`.

A `_meta.js` `pages` value that is not an array of strings is now a validation error instead of crashing the build.
