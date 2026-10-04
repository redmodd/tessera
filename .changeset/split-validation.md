---
'tessera-learn': patch
---

`tessera validate --standard` now applies that standard to page checks even when `course.config.js` does not parse.

An unknown `chrome` value in `course.config.js` is now a validation error, so `tessera dev` and `tessera export` stop on it as well as `tessera validate`. So is an `export`, `navigation`, `completion`, or `scoring` value that is not an object. These used to pass, so `export: "scorm12"` built for web.

A `_meta.js` `pages` value that is not an array of strings is now a validation error instead of crashing the build. A non-string `_meta.js` `title` is now a validation error.

A `course.config.js` or `_meta.js` default export holding a variable or other expression now says so instead of reporting a syntax error. Both files now report a syntax error or a missing `export default` with the same message.

Validation messages now print the offending value as written: a string is quoted, and `NaN` or `Infinity` no longer shows as `null`.
