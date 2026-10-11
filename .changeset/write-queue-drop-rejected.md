---
'tessera-learn': patch
---

In SCORM 1.2 and SCORM 2004, one write the LMS rejects no longer holds up the bookmark, suspend data, interactions and scores behind it for the rest of the session. A write rejected with a data-model or session-state error is logged and dropped without retrying. When the LMS rejects an interaction's id, that interaction is skipped and later interactions are still recorded. A write that fails while the course exits now logs the LMS error instead of failing silently.
