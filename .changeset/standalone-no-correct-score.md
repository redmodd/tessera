---
'tessera-learn': minor
---

**Behavior change:** a standalone question with no `correct` answer and no `score()` is left out of the page score, as in a quiz, and no longer offers Try again. It used to score 0, so a graded page holding one scores higher than before (a right answer beside a survey question: 50 → 100). A graded page of only such questions scores 100 and logs a dev warning, as a graded quiz does. To keep a question in the score, give it a `correct` or a `score()`.

The new `useProgress().pageUnscored()` is `true` for such a page, so a course can show no score.
