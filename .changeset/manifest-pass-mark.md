---
'tessera-learn': patch
---

SCORM 1.2 and SCORM 2004 packages now declare `scoring.passingScore` in `imsmanifest.xml` (as `adlcp:masteryscore` and as the primary objective's `minNormalizedMeasure`), so the LMS knows the pass mark without an admin entering it. SCORM and cmi5 packages declare a pass mark only under `completion.mode: "quiz"` with a quiz verdict, so cmi5 no longer declares `masteryScore` otherwise. Without one, cmi5 Passed and Failed statements keep their score instead of being sent without it.
