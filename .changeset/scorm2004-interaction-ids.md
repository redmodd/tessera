---
'tessera-learn': patch
---

SCORM 2004 interaction ids replace whitespace with `_` (`my question` → `my_question`) and keep everything else, so LMSs such as Moodle accept them, and `tessera validate` warns when a 2004 id will be rewritten.
