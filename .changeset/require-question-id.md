---
'tessera-learn': minor
---

**Breaking:** `MultipleChoice`, `FillInTheBlank`, `Matching` and `Sorting` require a string `id`, which is no longer derived from the prompt. A missing id, or a literal one that is blank or not a string, fails the build, and `useQuestion()` throws on one, which shows the error page. To upgrade, give each question a unique `id`, such as `id="capital_of_france"`.

A page that throws while rendering shows the error page instead of breaking the course.

A graded question whose `graded` and `id` follow a spread counts toward its page before it renders.
