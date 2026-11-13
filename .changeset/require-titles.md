---
'tessera-learn': minor
---

**Breaking:** every title is required. The build fails when `course.config.js` has no `title`, when a section, or a lesson folder with pages, has no `_meta.js` with a `title`, or when a page has no `pageConfig.title`. An empty or whitespace-only title fails too. Titles are no longer made from file and folder names, and a course with no title no longer ships as "Untitled Course". To upgrade, add the missing titles the build names.
