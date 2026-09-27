---
'tessera-learn': minor
---

Learners can end a session from the course. The default layout shows an **Exit course** button under an LMS, and `useCourse()` adds `exit()` and `canExit` for custom layouts. Exiting saves progress, ends the LMS session, and returns the learner to the cmi5 `returnURL` when the LMS supplies one; otherwise the course shows a "Session ended" screen. Under SCORM 2004 it also asks the LMS to suspend or exit the course.
