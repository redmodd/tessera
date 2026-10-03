---
'tessera-learn': patch
---

Standalone `useQuestion()` handle methods work unbound (`onclick={q.submit}`). A correct answer can no longer be retried, and `reset()` after a submit counts toward `maxRetries`. `commit()` reports each distinct answer once. `q.answer` keeps the value passed to `setAnswer()` after a standalone submit, as it does in a quiz. `response()` may return `undefined` while unanswered: standalone `submit()` no-ops and a quiz scores the question incorrect.
