---
'tessera-learn': patch
---

SCORM 1.2 courses take the pass mark from `cmi.student_data.mastery_score` when the LMS supplies one, overriding `scoring.passingScore`, as SCORM 2004 and cmi5 already do. A malformed LMS mastery score, including a cmi5 `LMS.LaunchData` `masteryScore`, logs a warning and is ignored, and a blank SCORM 2004 `cmi.scaled_passing_score` no longer sets the pass mark to 0.

An LMS pass mark such as 55 no longer lands a fraction above the mark, so a learner who scores exactly the mark passes.
