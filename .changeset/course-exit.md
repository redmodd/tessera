---
'tessera-learn': minor
---

Learners can end a session from the course. Under an LMS, the default layout shows an **Exit course** button that asks the learner to confirm, and `useCourse()` adds `exit()` and `canExit` for custom layouts. Exiting saves progress, ends the LMS session, and returns the learner to the cmi5 `returnURL` when there is one; otherwise the course shows a "Session ended" screen. Under SCORM, a `usePersistence()` value that cannot be serialized logs a warning instead of breaking the save.
