---
'tessera-learn': patch
---

cmi5, xAPI and web builds with an xAPI destination no longer bundle the SCORM adapters.
When a SCORM LMS sends no learner id, an explicit xAPI destination is skipped with a warning naming that cause instead of a missing `xapi.actor`.
