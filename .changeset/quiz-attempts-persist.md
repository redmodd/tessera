---
'tessera-learn': patch
---

Persist quiz attempts and results across sessions, recording the best attempt rather than the last, and load xAPI/cmi5 resume state separately from adapter init so an unreachable State API costs the bookmark rather than the launch.
