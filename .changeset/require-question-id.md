---
'tessera-learn': minor
---

**Breaking:** `MultipleChoice`, `FillInTheBlank`, `Matching` and `Sorting` require a string `id`; it is no longer derived from the prompt. A missing id, or a literal one that is blank or not a string, fails the build, and `useQuestion()` throws on one set at runtime, which shows the error page. To upgrade, give each question a unique `id`.

**Saved progress reset:** a question's id keys its saved answer and its LMS record. A question without an id used `mc-`, `fitb-`, `matching-` or `sorting-` plus its prompt, lowercased, with each run of characters other than `a-z` and `0-9` turned into `-`, trimmed and cut to 40 characters (`What is 2 + 2?` → `mc-what-is-2-2`). Set that id to keep learners' saved answers and the question's LMS history. Any other id loses them for a course already in use.

A page that throws while rendering shows the error page instead of breaking the course.

A graded question with a spread before `graded` and `id` (`<MultipleChoice {...q} id="q1" graded />`) counts toward its page score before it renders, like other graded questions.
