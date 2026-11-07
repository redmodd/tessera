---
'tessera-learn': patch
---

SCORM 2004 records a performance step answer that some LMSs reject in a form they accept (`-.5` → `-0.5`, `turn left` → `turn_left`). Tessera warns when this changes a correct answer, or makes the LMS record and the result disagree on whether an answer matches.
