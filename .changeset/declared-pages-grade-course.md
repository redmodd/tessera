---
'tessera-learn': minor
---

Breaking: only pages declaring `graded: true` or `quiz: { graded: true }` count toward the course score, so add `graded: true` to any page with graded standalone questions; `tessera dev` throws on one that is missing it.
