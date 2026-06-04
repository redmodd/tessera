---
'tessera-learn': patch
---

A course directory under `courses/` that has a `pages/` folder but is missing its `course.config.js` is now reported as skipped when listing the workspace's courses, instead of being silently dropped.
