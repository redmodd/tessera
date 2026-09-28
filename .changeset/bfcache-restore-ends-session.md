---
'tessera-learn': patch
---

A course restored from the browser's back/forward cache under an LMS now shows "Session ended" instead of running on untracked, so cmi5 and xAPI no longer lose the Completed, Passed/Failed, and Scored statements for work done there.

A restored course without an LMS now saves its progress again when the learner leaves and no longer counts the time spent in the back/forward cache. After any restore, `xapi:` destinations no longer send as if the page were closing.
