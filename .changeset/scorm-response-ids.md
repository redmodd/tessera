---
'tessera-learn': patch
---

SCORM 2004 percent-encodes ids inside a response (`Strongly agree` → `Strongly%20agree`), so strict LMSs accept likert, matching, sequencing and performance step ids with spaces. SCORM 1.2 slugs likert values like other ids (`Strongly agree` → `Strongly_agree`). Tessera warns when two ids in one response record as the same id.
Choice and matching answers record each item once. SCORM 2004 leaves out, with a console warning, values its data model rejects, such as a step answer holding `[,]` or a correct answer that repeats an item.
