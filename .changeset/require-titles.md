---
'tessera-learn': minor
---

**Breaking:** the course, every section and lesson `_meta.js`, and every page `pageConfig` need a non-empty `title`, and the build fails without one. Titles are no longer made from file and folder names. A section or lesson folder with no pages is left out of the course with a warning and needs no `_meta.js`.
