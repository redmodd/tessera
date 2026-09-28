---
'tessera-learn': patch
---

A course restored from the browser's back/forward cache under an LMS now shows "Session ended" instead of running on untracked. Progress made there was saved without being reported, so cmi5 and xAPI never sent Completed, Passed/Failed, or Scored for it, even on the next launch.

A restored course without an LMS now saves its progress again when the learner leaves, no longer counts the time spent in the back/forward cache, and its `xapi:` destinations no longer send as if the page were closing.
