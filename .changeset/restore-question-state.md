---
'tessera-learn': minor
---

Questions keep their state when the learner returns to a page. A standalone question comes back submitted with its answer and retry count, so a correct answer stays locked and `maxRetries` holds across visits. A quiz comes back with the best attempt's answers, so its results can be reviewed.

Custom widgets: pass `restore` to `useQuestion()` to show the saved answer. `useQuiz().restored` is now `true` only when the answers did not come back.
