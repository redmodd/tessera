---
'tessera-learn': minor
---

Add `pageConfig.required` (default `true`). `required: false` makes a graded page optional: it counts toward the course score once taken, and until then is left out rather than counted as 0.

A quiz verdict asks cmi5 for a Passed only when some graded page is required, and `completion.mode: "quiz"` now needs one (`tessera validate` errors). Neither a completion nor a `passed` reported to the LMS goes backwards when later graded work lowers the score; `useProgress().completionStatus` still reads live. cmi5 holds a Failed until the session ends, so one session never sends both verdicts.

`tessera validate` warns on unknown `quiz` fields and points `required`, `weight` and `completesOn` to `pageConfig`.
