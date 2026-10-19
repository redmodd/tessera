---
'tessera-learn': patch
---

A `performance` correct step answer written `min[:]max` grades a decimal step answer inside the range as correct. SCORM 1.2, which has no range syntax, leaves that correct answer out of the LMS record. Step answers grade by the text they record, so `3` matches a correct `'3'`.
