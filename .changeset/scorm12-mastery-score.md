---
'tessera-learn': patch
---

SCORM 1.2 courses take the pass mark from `cmi.student_data.mastery_score` when the LMS supplies one, overriding `scoring.passingScore`, as SCORM 2004 and cmi5 already do.
