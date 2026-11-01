---
'tessera-learn': patch
---

A quiz question with no `correct` answer no longer counts as wrong: it is left out of the quiz score, reported to the LMS with no result, and keeps its answer on an `incorrect-only` retry. A quiz where no question has a `correct` answer shows no score in the built-in `<Quiz>`, on a return visit too, and reports `scored: false` on `useQuiz()` and in the `tessera-quiz-complete` detail for a custom quiz. A graded quiz like that logs a dev warning.
