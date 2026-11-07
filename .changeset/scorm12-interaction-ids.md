---
'tessera-learn': patch
---

SCORM 1.2 interaction ids now follow the rule ids inside a response use: accented letters lose their accents (`café` → `cafe`), letters of other scripts record as code points (`東京` → `u6771u4EAC`), and underscores are kept as written (`_q1` stays `_q1`).
