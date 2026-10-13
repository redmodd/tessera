---
'tessera-learn': patch
---

xAPI and cmi5 `completed`, `passed`, `failed` and `scored` statements now carry the learner's total time across sessions. They carried a stale value before, `PT0S` in most courses. Under plain xAPI `terminated` carries the total too, so an LMS that keeps the latest duration shows the full time and not the last session's. The total keeps counting when a launch starts fresh (`resume: 'never'`, or a course whose structure changed). When the saved state cannot be read, plain xAPI statements carry no duration and cmi5 ones carry the session's.
