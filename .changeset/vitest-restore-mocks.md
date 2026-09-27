---
'tessera-learn': patch
---

Internal test cleanup: unit tests now reset mocks, undo spies, stubbed globals and env vars, and remove temp dirs automatically. Removes test-only runtime code: the `__resetUseCompletionWarning`, `__warnUnsubmittedQuiz` and `__warnEmptyQuiz` exports from `runtime/hooks.svelte`, and the xAPI publisher's fallback for a `fetch` result that is not a `Response`.
