---
'tessera-learn': patch
---

SCORM 1.2 now records answers that involve an 11th or later option. Option indexes past 9 encode as `a` to `z`, so up to 36 options fit; an answer past option 36, or an id missing from a custom widget's `options`, has its response or correct pattern left out with a console warning instead of being rejected by the LMS or recorded as the wrong option. Validation warns when a built-in question has more than 36 options under SCORM 1.2, and the guide's custom question examples now pass `options`.
