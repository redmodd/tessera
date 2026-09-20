---
'tessera-learn': minor
---

Add a `success` block that sets what makes a course passed, independently of what `completion.mode` makes it complete. `success.from` is `"quiz"`, `"fixed"` (with `status`) or `"none"`; omit it and `completion.mode` supplies the same verdict it does today. `completion.mode: "manual"` with `success: { from: "quiz" }` now gives a trigger-completed course a per-learner verdict, held until the trigger fires. `requireSuccessStatus` stays as an alias for the manual plus fixed case.

Packages now declare a pass mark (`adlcp:masteryscore`, `minNormalizedMeasure`, cmi5 `masteryScore`) exactly when `success.from` is `"quiz"`, and cmi5 `moveOn` is `CompletedAndPassed` only when the quiz both completes and judges the course.
