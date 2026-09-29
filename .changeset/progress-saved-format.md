---
'tessera-learn': minor
---

**Breaking:** the `progress` a custom `canAccess` receives no longer has the internal `manuallyCompleted`, `gradedScoreDecided`, `passScore`, `unlistedUnanswered`, `replay`, `restoreQuiz` and `restoreUnanswered` members. Read `completionStatus`, `successStatus` and `reportedScore` instead.

A corrupted value in saved progress is dropped or repaired on resume instead of discarding the whole save. Progress saved for pages the course does not have is skipped.

`goToIndex`, `prefetch`, `canAccessIndex`, `useProgress().markVisited` and `markChunk` ignore an index that is not a page in the course. `canGoPrev` is false when the previous page is locked.

Standalone question scores are clamped to 0–100 before they reach the LMS, and a question whose id is `__proto__` is saved.
