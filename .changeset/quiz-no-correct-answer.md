---
'tessera-learn': minor
---

**Behavior change:** a quiz question with no `correct` answer no longer counts as wrong: it is left out of the quiz score and reported to the LMS with no result. A quiz holding one scores higher than before for the same answers, so a learner can pass where they failed. Check the pass mark of any quiz with a survey or reflection question.

A quiz with nothing to score shows no score in the built-in `<Quiz>` and reports `scored: false` on `useQuiz()`, in the `tessera-quiz-complete` detail and through `useProgress().quizUnscored()`.
