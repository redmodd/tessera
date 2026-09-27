---
'tessera-learn': minor
---

Add `pageConfig.required` (default `true`). A graded page with `required: false` stays out of the course score until the learner takes it, instead of counting as 0. `completion.mode: "quiz"` needs at least one required graded page, and under a quiz verdict cmi5 `moveOn` is `CompletedAndPassed` only when the course has one.
