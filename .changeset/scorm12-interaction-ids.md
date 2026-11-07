---
'tessera-learn': patch
---

SCORM 1.2 interaction ids now keep accented letters without their accents (`café` → `cafe`) and record letters of other scripts as code points (`東京` → `u6771u4EAC`), as ids inside a response do, instead of dropping them.
