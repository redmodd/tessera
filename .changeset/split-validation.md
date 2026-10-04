---
'tessera-learn': patch
---

`tessera validate --standard` now applies that standard to page checks even when `course.config.js` does not parse.

`tessera validate` now rejects an unknown `chrome` value in `course.config.js`.

A `_meta.js` `pages` value that is not an array of strings is now a validation error instead of crashing the build.

A `course.config.js` or `_meta.js` default export holding a variable or other expression now says so instead of reporting a syntax error. Both files now report a syntax error or a missing `export default` with the same message.

Validation messages now print the offending value as written: a string is quoted, and `NaN` or `Infinity` no longer shows as `null`.
