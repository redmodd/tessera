---
'tessera-learn': patch
---

A `performance` correct step answer written `min[:]max` grades any decimal step answer inside it as correct. Performance steps grade in order and by the text they record, so `3` matches a correct `'3'`. A `numeric` correct with only `min` or `max` records as an open range (`5[:]`), not an exact value. A correct range with its minimum above its maximum warns in dev and is left out of the SCORM record. SCORM 1.2, which has no range syntax, leaves a correct answer holding a range out of the LMS record.
