---
'tessera-learn': patch
---

SCORM 2004 interaction ids replace whitespace and emoji with `_` (`my question` → `my_question`) and a malformed `urn:` prefix with `urn_`, and keep everything else, so LMSs such as Moodle accept them. `tessera validate` warns when a 2004 id will be rewritten, and SCORM courses warn in the console when two question ids record as the same id.
