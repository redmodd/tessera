---
'tessera-learn': patch
---

SCORM 2004 caps each `[,]`-separated part of a fill-in answer or response at 250 characters, not the whole value, so a multi-part answer within the cap is no longer left out of the LMS record or cut. A response cut to its SCORM length cap keeps the start of a character longer than the cap (a letter with hundreds of accents) instead of dropping it.
