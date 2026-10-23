---
'tessera-learn': patch
---

SCORM 1.2 and 2004 commit progress saves (bookmark, visited pages, `usePersistence`) and the session time at most every ten seconds, and right away when the page is hidden. A page killed without `pagehide` no longer resumes from the last status change.
