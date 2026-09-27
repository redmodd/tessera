---
'tessera-learn': patch
---

Internal test cleanup: unit tests now reset mocks and undo spies, stubbed globals and env vars automatically. Removes the test-only `__resetUseCompletionWarning` export from `runtime/hooks.svelte`.
