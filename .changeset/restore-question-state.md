---
'tessera-learn': minor
---

Questions keep their state when the learner returns to a page. A standalone question comes back submitted with its answer and retry count. A quiz comes back with the best attempt's answers, so its results can be reviewed. Custom widgets: pass `restore` to `useQuestion()` to show the saved answer. The dev console warns about a widget without it.

**Behavior change:** returning to a page no longer starts a standalone question over. A correct answer stays locked, a wrong one stays submitted, and `maxRetries` counts across visits. A custom widget that renders no retry button needs one, shown on `canRetry` and calling `retry()`, or the learner cannot answer again.

SCORM saves are written in ASCII, with every other character as a `\u` escape, so an LMS that stores non-ASCII text in less room than its limit cannot cut a save short. Such a character takes 6 bytes of the save.

**Behavior change:** `useQuiz().restored` is now `true` only when the answers did not come back. A quiz shell that hides Review on `restored` needs no change. One that reads it to tell a saved result from a new one no longer can once the answers restore.
