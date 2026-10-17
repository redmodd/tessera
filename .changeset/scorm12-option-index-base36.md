---
'tessera-learn': patch
---

SCORM 1.2 now records answers to questions with more than 10 options, up to 36; strict LMSs such as SCORM Cloud rejected them before. Past 36, the answer is left out of the LMS record with a console warning (the result is still recorded), and `tessera validate` flags built-in questions with more than 36 options.

Custom widgets: pass `options` (or `optionPairs` for matching) to `useQuestion()` so SCORM 1.2 can record each id. Without it, an id that is not one character from 0-9 or a-z logs a console warning, and an id missing from `options` is left out with one.
