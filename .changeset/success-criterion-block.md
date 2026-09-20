---
'tessera-learn': minor
---

Add a `success` block that sets what makes a course passed, independently of what `completion.mode` makes it complete. `success.from` is `"quiz"`, `"fixed"` (with `status`) or `"none"`; omit it and `completion.mode` supplies the verdict. `requireSuccessStatus` stays as an alias for the manual plus fixed case.

A pass/fail verdict no longer stands in for completion. SCORM 1.2 holds `passed` back until the course completes, rather than writing it to the single `lesson_status` field while the course is still incomplete; `failed` still reports immediately. A quiz verdict also needs an attempt, so completing without scoring a graded page reports `unknown` rather than `failed`.

Packages declare a pass mark (`adlcp:masteryscore`, `minNormalizedMeasure`, cmi5 `masteryScore`) only under `completion.mode: "quiz"` with a quiz verdict, so an LMS cannot reach its own verdict ahead of the course. cmi5 `moveOn` is `CompletedAndPassed` whenever a quiz judges, so a failed learner is denied credit in every delivery mode.
