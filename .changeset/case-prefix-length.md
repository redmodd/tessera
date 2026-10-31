---
'tessera-learn': patch
---

Under SCORM 2004, a case-sensitive fill-in answer can use the full 250 characters: the `{case_matters=true}` prefix no longer counts toward the cap. The prefix also no longer hides leading or trailing whitespace or a repeated `[,]`-separated part, so such an answer is left out of the LMS record with a warning, as it is without `caseSensitive`.
