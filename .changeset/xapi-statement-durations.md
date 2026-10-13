---
'tessera-learn': patch
---

xAPI and cmi5 `completed`, `passed`, `failed` and `scored` statements now carry the learner's total time across sessions. They carried a stale value before, `PT0S` in most courses. Under plain xAPI `terminated` carries the total too, so an LMS that keeps the latest duration shows the full time and not the last session's.
