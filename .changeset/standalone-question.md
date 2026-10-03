---
'tessera-learn': patch
---

Standalone `useQuestion()` handle methods work unbound (`onclick={q.submit}`). An answer scoring 100 can no longer be retried, `canRetry` is false until a submit, and `reset()` after a submit counts toward `maxRetries`. `commit()` reports each distinct answer once. `q.answer` holds only what was passed to `setAnswer()`, as in a quiz: a standalone submit no longer replaces it with the interaction's response. `response()` may return `undefined` while unanswered: standalone `submit()` no-ops and a quiz scores the question incorrect.
