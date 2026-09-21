---
'tessera-learn': minor
---

Add `pageConfig.required` (default `true`). `required: false` makes a graded page optional: it is left out of the course score until taken, rather than counted as 0.

`completion.mode: "quiz"` now needs a required graded page (`tessera validate` errors), and under a quiz verdict cmi5 `moveOn` asks for a Passed only when one exists.

The LMS never loses a completion or a `passed` when the score later drops, and keeps the best score from the pass on. `useProgress().gradedScore` and `completionStatus` still read live. cmi5 sends a Failed when the session ends, so a session never reports both Failed and Passed.

A page of standalone graded questions counts as answered once every graded question on it is, not after the first. Questions, quizzes and `useProgress().pageScore()` stay with the page on screen while the next one loads.

`tessera validate` warns on unknown `quiz` fields and points `required`, `weight` and `completesOn` to `pageConfig`.
