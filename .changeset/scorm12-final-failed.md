---
'tessera-learn': minor
---

A failing learner whose score can no longer change now reports `failed` on SCORM 1.2, where they stayed `incomplete`. Under `completion.mode: "quiz"`, a final failure ends the SCORM attempt with a normal exit. cmi5 sends a final `failed` right away instead of holding it for session end. A custom `score()` that returns a non-finite value counts as 0 and no longer locks the question.
