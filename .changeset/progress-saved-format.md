---
'tessera-learn': minor
---

**Breaking:** the `progress` a custom `canAccess` receives no longer has the internal `manuallyCompleted`, `gradedScoreDecided`, `passScore`, `unlistedUnanswered`, `replay`, `restoreQuiz` and `restoreUnanswered` members. Read `completionStatus`, `successStatus` and `reportedScore` instead.

A corrupted value in saved progress is repaired or dropped on resume instead of discarding the whole save.

Prev is disabled when the previous page is locked, and a standalone question's `score()` is clamped to 0–100.
