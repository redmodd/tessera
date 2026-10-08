---
'tessera-learn': patch
---

On SCORM 1.2, a score below the pass mark now reports `lesson_status` `incomplete` until the course completes, then `failed`. LMSes read `failed` as a finished attempt, so a learner who could still raise their score was shown as completed and could be sent into a new attempt on relaunch.
