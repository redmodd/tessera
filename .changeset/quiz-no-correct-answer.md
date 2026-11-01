---
'tessera-learn': patch
---

A quiz question with no `correct` answer no longer counts as wrong: it is left out of the quiz score and reported to the LMS with no result. A quiz with nothing to score shows no score in the built-in `<Quiz>` and reports `scored: false` on `useQuiz()`, in the `tessera-quiz-complete` detail and through `useProgress().quizUnscored()`.
