---
'tessera-learn': patch
---

Validation now catches more `course.config.js` and `_meta.js` mistakes: an unknown `chrome` value, an `export`, `navigation`, `completion`, or `scoring` value that is not an object (so `export: "scorm12"` no longer silently builds for web), and a `_meta.js` `title` or `pages` of the wrong type (which used to crash the build). `success: null` no longer crashes validation.

A default export that isn't a static object literal now says so, and validation messages print rejected values as written.
