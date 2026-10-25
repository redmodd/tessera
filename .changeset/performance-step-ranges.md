---
'tessera-learn': minor
---

**Behavior change:** `performance` steps grade in order and compare as recorded text, so the right steps in a different order are now incorrect, and `3` matches a correct `'3'`. A custom widget should send steps in the order of its `correct` answer. A `numeric` correct with only `min` or `max` records as an open range (`5[:]`), not an exact value, and SCORM 1.2, which has no range syntax, leaves it out of the LMS record.

A `performance` correct step answer can be a `min[:]max` range, and any decimal step answer inside it grades as correct. SCORM 1.2 leaves a correct answer holding a range out of the LMS record. In dev, a console warning flags a range with its minimum above its maximum (left out of the SCORM record) and a `[:]` answer that is not a valid range (graded as exact text).
