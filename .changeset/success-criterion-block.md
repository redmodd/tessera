---
'tessera-learn': minor
---

Add a `success` block that sets what makes a course passed, independently of what `completion.mode` makes it complete. `success.from` is `"quiz"`, `"fixed"` (with `status`) or `"none"`; omit it and `completion.mode` supplies the verdict. `requireSuccessStatus` stays as an alias for the manual plus fixed case.

`passed` now waits for the course to complete, in every standard, instead of a verdict counting as completion. cmi5 `moveOn` is `CompletedAndPassed` whenever the course is sure to send a verdict.
