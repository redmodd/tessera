---
'tessera-learn': patch
---

Internal: `ProgressState` now derives completion/success status with Svelte 5 `$derived`, removing the imperative `recalculateCompletion`/`recalculateSuccess` protocol and its scattered call sites. No behavior change.
