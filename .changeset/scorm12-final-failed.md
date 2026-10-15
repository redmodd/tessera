---
'tessera-learn': minor
---

A failing learner whose score can no longer change now reports `failed` on SCORM 1.2 instead of staying `incomplete`. Under `completion.mode: "quiz"`, a final failure ends the SCORM 1.2 or 2004 attempt with a normal exit, so the next launch starts a new attempt. cmi5 sends a final `failed` right away instead of holding it for session end. A `useQuestion` `score()` that returns a non-finite value now scores 0 instead of locking the question.
