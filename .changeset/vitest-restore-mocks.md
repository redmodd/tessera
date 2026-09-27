---
'tessera-learn': patch
---

`MultipleChoice`, `FillInTheBlank`, `Matching`, `Sorting` and `Sidebar` now declare their prop types, so TypeScript and svelte-check no longer require `id`, `graded`, `maxRetries` or `onclose`.

Internal test cleanup: unit tests now reset mocks, undo spies, stubbed globals and env vars, and remove temp dirs automatically, and `pnpm check` type-checks them. Removes test-only runtime code: the `__resetUseCompletionWarning`, `__warnUnsubmittedQuiz` and `__warnEmptyQuiz` exports from `runtime/hooks.svelte`, and the xAPI publisher's fallback for a `fetch` result that is not a `Response`.
