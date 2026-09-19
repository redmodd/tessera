---
'tessera-learn': patch
---

SCORM 2004 packages declare `scoring.passingScore` in `imsmanifest.xml` as the primary objective's `minNormalizedMeasure`, so the LMS sets `cmi.scaled_passing_score` without an admin entering it. Manual-completion courses declare none.
