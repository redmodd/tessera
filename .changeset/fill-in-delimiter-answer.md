---
'tessera-learn': patch
---

A fill-in answer starting with `{lang=`, `{case_matters=…}` or `{order_matters=…}` is left out of the SCORM 2004, cmi5 and xAPI record, with a warning, since the LMS reads it as a delimiter. Grading still uses it.

Under SCORM 2004, a fill-in or long-fill-in response starting with `{lang=` is left out of the record, with a warning, since the LMS reads it as a language tag or rejects it.

cmi5 and xAPI leave out a reversed correct range, with a warning, as SCORM 2004 does.
