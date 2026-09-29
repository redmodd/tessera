---
'tessera-learn': minor
---

**Breaking:** the `progress` a custom `canAccess` receives no longer has the internal `manuallyCompleted`, `gradedScoreDecided`, `passScore`, `unlistedUnanswered`, `replay`, `restoreQuiz` and `restoreUnanswered` members. Read `completionStatus`, `successStatus` and `reportedScore` instead.

Resume skips saved progress for pages the course does not have, drops a corrupted saved score or unanswered question id instead of discarding the whole save, and restores a corrupted quiz attempt count as one. `useProgress().markVisited` and `markChunk` ignore a page the course does not have, and `markChunk` ignores a chunk that is not a whole number. `goToIndex`, `prefetch`, `canAccessIndex` and a saved bookmark treat a page index that is not a whole number as no page. `canGoPrev` is false when the previous page is locked. A standalone question's `score()` and restored scores are clamped to 0–100, so the LMS never receives a score outside that range. A standalone question whose id is `__proto__` is saved instead of silently dropped.
