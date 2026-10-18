---
'tessera-learn': patch
---

SCORM 1.2 and 2004 now record the first part of an over-long interaction response instead of losing it when a strict LMS rejects it (under SCORM 2004: fill-in, long-fill-in, other and performance step answers). `tessera validate` warns about `<FillInTheBlank>` answers the LMS record leaves out: those over the length cap, and those past the 10th. A shorthand prop like `{src}` no longer hides a missing alt text, title or other required prop from `tessera validate`, and a prop written before a `{...spread}` counts as one the spread may replace.
