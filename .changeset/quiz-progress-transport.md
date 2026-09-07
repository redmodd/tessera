---
'tessera-learn': patch
---

Quiz scores now reach progress directly instead of riding a DOM event, so `useQuiz()` no longer needs a host element and the built-in `<Quiz>` no longer dispatches `tessera-quiz-complete`.
