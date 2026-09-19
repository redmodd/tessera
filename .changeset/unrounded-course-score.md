---
'tessera-learn': patch
---

The course score sent to the LMS is no longer rounded to a whole number, so it matches the average the pass/fail decision uses. A course average of 69.67 against a pass mark of 70 now reports 69.67 with `failed`, instead of 70 with `failed`, which an LMS that grades from the score could turn into `passed`. `useProgress().gradedScore.average` is kept to 5 decimal places.
