---
'tessera-learn': patch
---

A fill-in answer starting with `{lang=`, `{case_matters=` or `{order_matters=` is left out of the SCORM 2004, cmi5 and xAPI record, with a warning, since the LMS reads it as a delimiter. Grading still uses it.
