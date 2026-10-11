---
'tessera-learn': patch
---

`tessera export` now fails when a page, a `_meta.js`, `layout.svelte`, `quiz.svelte` or `course.runtime.js` is saved, added or removed while it runs. It used to package the changed file without validating it. The error names the files; run the export again. The build behind `tessera a11y` and `tessera check` fails the same way.

`tessera a11y` and `tessera check` now scan the pages their build bundled. A page added as the audit started could be left out of the scan while the report counted every page as covered.
