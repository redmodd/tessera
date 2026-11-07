---
'tessera-learn': patch
---

SCORM 2004 interaction ids follow the SCORM 1.2 id rule (`my question` → `my_question`), so LMSs such as Moodle accept ids with spaces, and `tessera validate` warns when a 2004 id will be rewritten.
