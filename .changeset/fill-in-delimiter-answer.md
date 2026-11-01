---
'tessera-learn': patch
---

A fill-in or long-fill-in answer starting with `{lang=…}`, `{case_matters=…}` or `{order_matters=…}`, or a fill-in answer with a `[,]` part that does, is left out of the SCORM 2004, cmi5 and xAPI record with a warning. Grading still uses it.

A fill-in or long-fill-in response is left out the same way under cmi5 and xAPI, and under SCORM 2004 when it, or any `[,]` part of it, starts with `{lang=`. SCORM 2004 also leaves out a long-fill-in answer starting with an unclosed `{lang=`.

cmi5 and xAPI leave out a reversed correct range, with a warning, as SCORM 2004 does.
