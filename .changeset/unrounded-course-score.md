---
'tessera-learn': minor
---

**Behavior change:** quiz, page and course scores are now kept to 2 decimal places, and pass/fail is judged on the same score the LMS is sent. Quiz scores were rounded to whole numbers, so 2 of 3 correct scored 67 and met a pass mark of 67; it now scores 66.67 and fails. If a single quiz is the whole course score, lower a whole-number `scoring.passingScore` by 0.5 (67 to 66.5) to pass the same scores as before. Averages across pages were already judged unrounded, so leave the pass mark alone for those. A course average of 69.67 against a pass mark of 70 now reports 69.67 with `failed`, instead of 70 with `failed`.
