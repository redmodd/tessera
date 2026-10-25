---
'tessera-learn': patch
---

SCORM 1.2 and 2004 commit progress saves (bookmark, visited pages, `usePersistence`) and the session time at most every ten seconds while the page is visible, and right away once it is hidden. If the browser kills the page without `pagehide`, an LMS that keeps only committed values now resumes from the last progress save, not the last status change.
