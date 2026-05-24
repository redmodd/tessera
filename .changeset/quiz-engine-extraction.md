---
'tessera-learn': patch
---

Extract `QuizEngine` from the `useQuiz` closure into a directly-instantiable,
framework/DOM-free class (`src/runtime/quiz-engine.svelte.ts`). `useQuiz` is now
a thin Svelte wrapper over it. Internal refactor only — no public API or behavior
change; `useQuiz` still returns `UseQuizHandle`. (`create-tessera` bumps in
lockstep via the fixed-version group.)
