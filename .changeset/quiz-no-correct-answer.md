---
'tessera-learn': patch
---

A quiz question with no `correct` answer no longer counts as wrong: it is left out of the quiz score, reported to the LMS with no result, and keeps its answer on an `incorrect-only` retry. The built-in `<Quiz>` shows no score when no question has a `correct` answer, and a graded quiz like that logs a dev warning.
