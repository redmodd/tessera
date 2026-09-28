---
'tessera-learn': patch
---

Resume skips saved progress for pages the course does not have, and restores a corrupted quiz attempt count as one. `useProgress().markVisited` and `markChunk` ignore a page the course does not have, and `markChunk` ignores a chunk that is not a whole number. `goToIndex`, `prefetch`, `canAccessIndex` and a saved bookmark treat a page index that is not a whole number as no page. A standalone question's `score()` and restored scores are clamped to 0–100, so the LMS never receives a score outside that range.
