---
'tessera-learn': patch
---

SCORM 1.2 now records answers that involve an 11th or later option, up to 36 options (indexes past 9 encode as `a` to `z`). An answer past option 36, or an id missing from a custom widget's `options`, has its response or correct pattern left out with a console warning. Validation warns when a built-in question has more than 36 options under SCORM 1.2. The guide's custom question examples now pass `options`.
