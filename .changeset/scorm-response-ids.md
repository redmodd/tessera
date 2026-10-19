---
'tessera-learn': patch
---

SCORM 2004 percent-encodes ids inside a response (`Strongly agree` → `Strongly%20agree`) so strict LMSs accept them, and SCORM 1.2 slugs likert values like other ids, with a warning when that changes one. Tessera warns when two ids in one response record as the same id. Choice and matching answers record and grade each item once, and a performance answer must match each correct step, repeats included. SCORM 2004 leaves out, with a console warning, values its data model rejects, and validation warns about Matching and Sorting lists over 36 items on SCORM 2004 too.
