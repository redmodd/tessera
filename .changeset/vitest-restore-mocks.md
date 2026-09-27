---
'tessera-learn': patch
---

Internal test cleanup: unit tests now reset mocks and undo spies, stubbed globals and env vars automatically. Removes test-only runtime code: the `__resetUseCompletionWarning`, `__warnUnsubmittedQuiz` and `__warnEmptyQuiz` exports from `runtime/hooks.svelte`, and the xAPI publisher's fallback for a `fetch` result that is not a `Response`.
