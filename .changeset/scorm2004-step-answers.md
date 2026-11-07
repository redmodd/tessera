---
'tessera-learn': patch
---

SCORM 2004 records a performance step answer that is not a decimal or an id as an id (`turn left` → `turn_left`), so LMSs such as Moodle accept it. Tessera warns when this changes a correct answer, or makes a wrong answer record the same as the correct one.
