---
'tessera-learn': patch
---

SCORM 2004 percent-encodes ids inside a response (`Strongly agree` → `Strongly%20agree`), so strict LMSs accept likert, matching, sequencing and performance step ids with spaces. SCORM 1.2 warns when two ids in one response record as the same id.
