---
'tessera-learn': patch
---

Custom `useQuestion` widgets that send labels as ids (`Strongly agree`) now record on strict SCORM LMSs. SCORM 2004 percent-encodes them (`Strongly%20agree`), and SCORM 1.2 converts likert values to letters, digits and underscores, as it already does for other ids. Built-in widgets are unaffected. A console warning names any two ids that would record as one, and any id cut to fit the 250-character limit.

Grading counts a repeated choice or matching item once, and a repeated performance step no longer stands in for a missing one. On SCORM 2004, a value the LMS would reject is left out with a console warning instead of being refused, and validation flags Matching and Sorting lists over 36 items.
