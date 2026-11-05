---
'tessera-learn': patch
---

SCORM 2004 records response ids (options without text, likert values, performance step names) as letters, digits and `_`, which Moodle accepts, instead of percent-encoding them.
