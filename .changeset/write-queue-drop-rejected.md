---
'tessera-learn': patch
---

In SCORM 1.2 and SCORM 2004, a write the LMS rejects with a data-model or session-state error is now logged and dropped without retrying, so later writes (bookmark, suspend data, interactions, scores) still reach the LMS. An interaction whose id the LMS rejects no longer shifts later interactions to an index the LMS refuses. A write that fails while the course exits now logs the LMS error instead of failing silently.
