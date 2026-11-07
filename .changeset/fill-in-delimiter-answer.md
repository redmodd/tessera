---
'tessera-learn': patch
---

SCORM 2004, cmi5 and xAPI leave out, with a warning, a fill-in or long-fill-in answer or response the LMS would read as a delimiter or reject: one starting with `{lang=`, `{case_matters=` or `{order_matters=`, or with a `[,]` part that does. Grading still uses it.

cmi5 and xAPI leave out a reversed correct range, with a warning, as SCORM 2004 does.
