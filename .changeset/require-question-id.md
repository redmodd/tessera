---
'tessera-learn': minor
---

**Breaking:** `MultipleChoice`, `FillInTheBlank`, `Matching` and `Sorting` require a string `id`, which is no longer derived from the prompt. A missing id, or a blank one written as a literal, fails the build, and `useQuestion()` throws on one, which shows the error page. To upgrade, give each question a unique `id`, such as `id="capital_of_france"`.

A page that throws while rendering shows the error page instead of breaking the course.
