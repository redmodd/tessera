---
'tessera-learn': minor
---

**Behavior change:** a standalone question answer that scores 100 can no longer be retried, so the built-in question widgets hide Try again after a correct answer. `canRetry` is false until a submit, and `reset()` after a submit counts toward `maxRetries`. A custom widget whose Try again button is gated on `q.correct === false` should gate it on `q.canRetry`, or the button does nothing once retries run out. The lock and the retry count reset when the widget remounts.

**Behavior change:** `q.answer` holds only what was passed to `setAnswer()`, as in a quiz. A standalone submit no longer replaces it with the interaction's response.

`commit()` reports each distinct answer once. `response()` may return `undefined` while unanswered: standalone `submit()` no-ops and a quiz scores the question incorrect.
