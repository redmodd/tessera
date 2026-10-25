---
'tessera-learn': patch
---

A `performance` correct step answer can be a `min[:]max` range, and any decimal step answer inside it grades as correct. Steps grade in order, and other step answers compare as recorded text, so `3` matches a correct `'3'`. A `numeric` correct with only `min` or `max` records as an open range (`5[:]`), not an exact value.
In dev, a console warning flags a range with its minimum above its maximum (left out of the SCORM record) and a `[:]` answer that is not a valid range (graded as exact text). SCORM 1.2 has no range syntax, so it leaves a correct answer holding a range out of the LMS record.
