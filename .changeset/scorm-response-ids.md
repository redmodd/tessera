---
'tessera-learn': patch
---

SCORM 2004 percent-encodes ids inside a response (`Strongly agree` → `Strongly%20agree`), so strict LMSs accept likert, matching, sequencing and performance step ids with spaces. SCORM 1.2 slugs likert values like other ids (`Strongly agree` → `Strongly_agree`). Tessera warns when two ids in one response record as the same id.
A choice response that repeats an id records it once, so SCORM 2004 no longer rejects it. A SCORM 2004 performance step answer holding `[,]`, `[.]` or `[:]` is left out of the LMS record with a console warning instead of being rejected.
