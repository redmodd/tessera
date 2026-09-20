---
'tessera-learn': minor
---

Add a `success` block that sets what makes a course passed, independently of what `completion.mode` makes it complete. `success.from` is `"quiz"`, `"fixed"` (with `status`) or `"none"`; omit it and `completion.mode` supplies the verdict. `requireSuccessStatus` stays as an alias for the manual plus fixed case.

A verdict no longer stands in for completion: SCORM 1.2 holds `passed` back until the course completes, and a quiz verdict now needs an attempt. Packages declare a pass mark only under `completion.mode: "quiz"` with a quiz verdict, and cmi5 `moveOn` is `CompletedAndPassed` whenever the course sends a verdict at all.
