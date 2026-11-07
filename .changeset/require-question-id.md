---
'tessera-learn': minor
---

**Breaking:** `MultipleChoice`, `FillInTheBlank`, `Matching` and `Sorting` require an `id`; they no longer derive one from the prompt text, which changed whenever the prompt was edited. A question with a missing or empty id fails the build, and `useQuestion()` throws when given no id. To upgrade, add a unique `id` to each question, such as `id="capital_of_france"`.

A page that throws while rendering now shows the error page instead of breaking the course.
