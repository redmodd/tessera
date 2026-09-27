---
'tessera-learn': patch
---

`tessera validate` warns on unknown `pageConfig` and `quiz` fields and on graded questions split across `{#if}`, `{#each}` or `{#await}` branches. It no longer flags `id="q-{i}"` as a duplicate, checks a page's own component as the built-in it shares a name with, or treats import text in the markup as an import.
