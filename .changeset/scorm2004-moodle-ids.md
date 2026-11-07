---
'tessera-learn': patch
---

SCORM 2004 records response ids (options without text, likert values, performance step names) as letters, digits and `_`, which Moodle accepts, instead of percent-encoding them. On SCORM 1.2 and 2004, these ids now drop accents and record letters of other scripts as code points (`東京` → `u6771u4EAC`), so they stay distinct.
