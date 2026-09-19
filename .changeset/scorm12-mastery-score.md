---
'tessera-learn': minor
---

SCORM 1.2 courses take the pass mark from `cmi.student_data.mastery_score` when the LMS supplies one, overriding `scoring.passingScore`, as SCORM 2004 and cmi5 already do. A malformed SCORM mastery value logs a warning and is ignored, and a blank SCORM 2004 `cmi.scaled_passing_score` no longer sets the pass mark to 0.

An LMS pass mark such as 55 no longer lands a fraction above the mark, so a learner who scores exactly the mark passes. Pass/fail and `completion.mode: "quiz"` now compare the rounded course score the LMS receives, so the course and the LMS agree. `useProgress().gradedScore.score` exposes that rounded score for display.
