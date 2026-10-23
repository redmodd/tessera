---
'tessera-learn': patch
---

SCORM 1.2 and 2004 commit progress saves (bookmark, visited pages, `usePersistence`) and the session time at most every ten seconds while the page is visible, and right away once it is hidden. On an LMS that keeps only committed values, a page killed without `pagehide` no longer resumes from the last status change.
