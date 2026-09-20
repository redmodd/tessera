---
'tessera-learn': minor
---

Add a `success` block that sets what makes a course passed, independently of what `completion.mode` makes it complete. `success.from` is `"quiz"`, `"fixed"` (with `status`) or `"none"`; omit it and `completion.mode` supplies the verdict it does today. `requireSuccessStatus` stays as an alias for the manual plus fixed case.

A quiz verdict now needs an attempt: a learner who completes a course without scoring a graded page reports `unknown` rather than `failed`.
