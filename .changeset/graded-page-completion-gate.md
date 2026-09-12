---
'tessera-learn': patch
---

A `graded: true` page completes once a graded question on it is answered, not on view, in both `completion.mode: "percentage"` and `navigation.mode: "sequential"`; the built-in question components take a `graded` prop so a standalone question can count; `tessera validate` warns when such a page has no graded question, and errors when nothing on it can be scored.
