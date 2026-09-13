---
'tessera-learn': patch
---

Only pages declaring `graded: true` or `quiz: { graded: true }` count toward the course score and passed/failed, and `tessera validate` errors on a graded question on an undeclared page or `graded: true` beside an ungraded quiz.
