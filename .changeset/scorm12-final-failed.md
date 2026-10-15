---
'tessera-learn': minor
---

A failing learner whose score can no longer change now reports `failed` on SCORM 1.2, where they stayed `incomplete`. The score is final once every graded page has scored 100 or used up its quiz `maxAttempts` or question `maxRetries`. Under `completion.mode: "quiz"`, a final failure ends the SCORM attempt with a normal exit.
