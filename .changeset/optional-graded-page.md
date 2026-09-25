---
'tessera-learn': minor
---

Add `pageConfig.required` (default `true`). `required: false` makes a graded page optional: left out of the course score until taken, rather than counted as 0.

`completion.mode: "quiz"` now needs a required graded page (`tessera validate` errors), and under a quiz verdict cmi5 `moveOn` asks for a Passed only when one exists.

The LMS never loses a completion or a `passed` when the score later drops, and keeps the best score from the pass on. cmi5 sends a Failed when the session ends.

A page of standalone graded questions counts as answered once every graded question on it is, including built-in ones behind a reveal, rather than after the first.

`tessera validate` warns on unknown `pageConfig` and `quiz` fields, and on graded questions split across the branches of an `{#if}`, `{#each}` or `{#await}`. It treats an attribute with `{…}` in it as computed rather than literal, and no longer checks a page's own component as a built-in when the names match. Import text in a page's markup no longer hides the warning that a page has nothing to score.
