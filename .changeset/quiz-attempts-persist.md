---
'tessera-learn': patch
---

Persist quiz attempts and results across sessions; the recorded score is now the best attempt, not the last. Resume state loads separately from adapter init, so an unreadable xAPI/cmi5 State API costs the bookmark rather than the launch and never overwrites saved progress.
