---
'tessera-learn': minor
---

Add a `success` block that sets what makes a course passed, independently of what `completion.mode` makes it complete. `success.from` is `"quiz"`, `"fixed"` (with `status`) or `"none"`; omit it and `completion.mode` supplies the verdict. `requireSuccessStatus` stays as an alias for the manual plus fixed case.

**Behavior change:** a verdict no longer counts as completion. SCORM 1.2 reports `incomplete` until the course completes and only then `passed`, where a learner who passed an early quiz in a percentage course used to be reported `passed` and get credit.

**Behavior change:** cmi5 `moveOn` is `CompletedAndPassed` whenever the course is sure to send a verdict, not only under `completion.mode: "quiz"`. In a percentage course with a graded page, a learner who fails no longer satisfies the AU, as SCORM already did. If the quiz should not gate credit, set `success: { from: "none" }`.
