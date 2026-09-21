---
'tessera-learn': minor
---

Add `pageConfig.required` (default `true`). `required: false` makes a graded page optional: it counts toward the course score once taken, and until then is left out rather than counted as 0.

A quiz verdict asks cmi5 for a Passed only when some graded page is required, and `completion.mode: "quiz"` now needs one (`tessera validate` errors). The completion reported to the LMS no longer goes backwards when later graded work lowers the score; `useProgress().completionStatus` still reads live.
