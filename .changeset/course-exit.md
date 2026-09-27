---
'tessera-learn': minor
---

Learners can exit the course under an LMS: the default layout shows a confirmed **Exit course** button, and `useCourse()` adds `exit()` and `canExit` for custom layouts. Exiting saves progress, ends the LMS session, and returns to the cmi5 `returnURL` or shows a "Session ended" screen. Under SCORM, a `usePersistence()` value that cannot be serialized logs a warning instead of breaking the save.
