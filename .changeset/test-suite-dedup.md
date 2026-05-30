---
'tessera-learn': patch
---

test: remove redundant navigation-gating/quiz tests with no loss of coverage (delete `quiz-integration.test.ts`, collapse the duplicated `isPageLocked` scenario blocks into one delegation smoke test, trim score assertions already covered by `use-quiz.test.ts`). No runtime changes.
