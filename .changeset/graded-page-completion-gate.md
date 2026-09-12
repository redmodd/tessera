---
'tessera-learn': patch
---

A `graded: true` page completes once a graded question on it is answered, not on view, in both `completion.mode: "percentage"` and `navigation.mode: "sequential"`; `tessera validate` warns when such a page has no graded question.
