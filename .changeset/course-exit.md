---
'tessera-learn': minor
---

Learners can exit the course under an LMS: the default layout shows a confirmed **Exit course** button, and `useCourse()` adds `exit()` and `canExit` for custom layouts. Exiting saves progress, ends the LMS session, and returns to the cmi5 `returnURL` or shows a "Session ended" screen. A `usePersistence()` value that is not JSON-serializable logs a warning and is left out of the save instead of costing the whole save. `useXAPI().sendStatement()` rejects a statement that is not JSON-serializable instead of stalling every later send.
