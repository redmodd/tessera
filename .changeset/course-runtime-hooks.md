---
'tessera-learn': minor
---

Custom page access rules and xAPI login/learner functions now go in a new optional `course.runtime.js` file (functions in `course.config.js` never worked), and each xAPI destination with its own endpoint now needs an `id`.
