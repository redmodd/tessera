---
'tessera-learn': minor
---

Add a `success` block that sets what makes a course passed, independently of what `completion.mode` makes it complete. `success.from` is `"quiz"`, `"fixed"` (with `status`) or `"none"`; omit it and `completion.mode` supplies the verdict. `requireSuccessStatus` stays as an alias for the manual plus fixed case.

**Behavior change:** `passed` now waits for the course to complete, in every standard; `failed` is still reported as soon as the score is final. A learner who passed an early quiz in a percentage course used to be reported `passed` while the course was incomplete, which a SCORM 1.2 LMS grants credit for.

**Behavior change:** cmi5 `moveOn` is `CompletedAndPassed` whenever the course is sure to send a verdict: a quiz verdict with at least one required graded page, or a fixed status, including a manual course with `requireSuccessStatus`. It used to be `CompletedAndPassed` only under `completion.mode: "quiz"`. In a percentage course, a learner who fails no longer satisfies the AU, as SCORM already did, and under `requireSuccessStatus: "failed"` no learner does. If the verdict should not gate credit, set `success: { from: "none" }`.
