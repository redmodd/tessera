---
'tessera-learn': patch
---

A standalone question with no `correct` answer and no `score()` is left out of the page score, as in a quiz, and no longer offers Try again. A graded page of only such questions scores 100 and logs a dev warning, as a graded quiz does. The new `useProgress().pageUnscored()` is `true` for such a page, so a course can show no score.
