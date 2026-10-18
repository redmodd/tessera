---
'tessera-learn': patch
---

SCORM 1.2 and SCORM 2004 now record the first part of an over-long interaction response instead of losing the whole response when a strict LMS rejects it. `tessera validate` flags `<FillInTheBlank>` answers the LMS record leaves out: those too long for it, and those past the 10th.
