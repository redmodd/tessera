---
'tessera-learn': patch
---

xAPI and cmi5 `completed`, `passed`, `failed` and `scored` statements now carry the learner's total time across sessions, where they carried a stale value, `PT0S` in most courses. Under plain xAPI `terminated` carries the total too. When the saved state cannot be read, plain xAPI statements carry no duration and cmi5 ones carry the session's.
