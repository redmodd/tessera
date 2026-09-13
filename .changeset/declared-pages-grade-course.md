---
'tessera-learn': patch
---

Only pages declaring `graded: true` or `quiz: { graded: true }` count toward the course score; `tessera validate` flags graded questions on undeclared pages and `graded: true` beside an ungraded quiz.
