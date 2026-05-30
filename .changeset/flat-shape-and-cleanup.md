---
'tessera-learn': patch
'create-tessera': patch
---

Fix flat-shape courses (`.svelte` pages directly inside a section directory)
rendering no pages: manifest generation and validation now share one page
walker, so they can't disagree on which files are pages. Remaining changes are
internal cleanup with no public API change.
