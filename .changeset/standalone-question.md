---
'tessera-learn': patch
---

A standalone `useQuestion()` answer scoring 100 can no longer be retried, `canRetry` is false until a submit, and `reset()` after a submit counts toward `maxRetries`, so gate a Try again button on `canRetry`. The lock and the retry count reset when the widget remounts. `commit()` reports each distinct answer once. `q.answer` holds only what was passed to `setAnswer()`, as in a quiz: a standalone submit no longer replaces it with the interaction's response. `response()` may return `undefined` while unanswered: standalone `submit()` no-ops and a quiz scores the question incorrect.
