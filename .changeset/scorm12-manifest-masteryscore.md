---
'tessera-learn': patch
---

SCORM 1.2 packages declare `scoring.passingScore` as `adlcp:masteryscore` in `imsmanifest.xml`, so the LMS knows the pass mark without an admin entering it. Manual-completion courses declare none. `course.config.js` validation rejects `NaN` for `scoring.passingScore` and `completion.percentageThreshold`.
