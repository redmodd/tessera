---
'tessera-learn': minor
---

Add `pageConfig.required` (default `true`). A graded page with `required: false` stays out of the course score until the learner takes it, instead of counting as 0. `completion.mode: "quiz"` needs at least one required graded page, and under a quiz verdict cmi5 `moveOn` is `CompletedAndPassed` only when the course has one.

A page of standalone graded questions now completes once every graded question on it is answered, including built-in ones not yet revealed, rather than after the first.

A score that drops later no longer takes back a completion or a `passed` the LMS already has, and from the pass on the LMS keeps the best score reached. cmi5 holds a Failed until the session ends, so a retake that passes in the same session sends only Passed.

`tessera validate` warns on unknown `pageConfig` and `quiz` fields and on graded questions split across `{#if}`, `{#each}` or `{#await}` branches. It no longer flags `id="q-{i}"` as a duplicate, checks a page's own component as the built-in it shares a name with, or treats import text in the markup as an import.
