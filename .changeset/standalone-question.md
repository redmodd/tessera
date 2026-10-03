---
'tessera-learn': patch
---

Standalone `useQuestion()` fixes: handle methods work unbound (`onclick={q.submit}`), as they do inside a quiz. `commit()` reports each distinct answer once, and `submit()` reports the final answer when it changed since a `commit()`. `submit()` no-ops when `response()` returns nothing. A correct answer can no longer be retried, so the built-in widgets hide Try again once correct, and `isLockedCorrect` is true as soon as one is submitted. `retry()` no-ops before a submit, and `reset()` after a submit counts as a retry, so `maxRetries` holds.
