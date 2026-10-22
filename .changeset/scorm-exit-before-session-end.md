---
'tessera-learn': patch
---

SCORM 1.2 and 2004 write the exit mode with every status commit, not only when the session ends. A page the browser kills without `pagehide` (iOS Safari in the background, a crash) now leaves the attempt suspended instead of exited normally.
