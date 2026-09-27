---
'tessera-learn': minor
---

**Behavior change:** under `completion.mode: "quiz"` with a quiz verdict, SCORM packages declare `scoring.passingScore` in `imsmanifest.xml`, so the LMS judges pass/fail from the score without an admin entering a pass mark. SCORM 1.2 declares it as `adlcp:masteryscore`, which the LMS can use to set `lesson_status` itself. SCORM 2004 declares it as the primary objective's `minNormalizedMeasure` with `satisfiedByMeasure`, so the LMS takes satisfaction from `cmi.score.scaled`. cmi5 now declares `masteryScore` only in the same case, so Passed and Failed statements in other courses keep their score instead of being sent without it.
