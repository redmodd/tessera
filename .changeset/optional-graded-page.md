---
'tessera-learn': minor
---

Add `required` beside `graded` on a page, defaulting to `true`. `required: false` makes a graded page optional: its score counts when the learner takes it, and the page leaves both halves of the course average when they don't, instead of entering as a 0. That expresses practice quizzes beside a final exam, which `graded: false` and `weight: 0` both lose.

A skipped required page still counts 0 and reads `failed`. Packages ask the LMS for a Passed, and declare a pass mark, only when a graded page is required, so a course of optional practice satisfies its cmi5 AU on Completed alone. `completion.mode: "quiz"` needs a required graded page to judge, and `tessera validate` errors without one. Completion no longer goes backwards: graded work taken after a course completes moves the score and the verdict, and the completion the LMS holds stands, across sessions. `useProgress().completionStatus` is the live reading and still follows the score both ways.
