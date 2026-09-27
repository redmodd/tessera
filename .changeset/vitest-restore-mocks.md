---
'tessera-learn': patch
---

Internal test cleanup: unit tests now reset mocks and undo spies, stubbed globals and env vars automatically. Removes the test-only exports `__resetUseCompletionWarning`, `__warnUnsubmittedQuiz` and `__warnEmptyQuiz` from `runtime/hooks.svelte`.
