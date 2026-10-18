---
'tessera-learn': patch
---

`<FillInTheBlank>` given a single answer string no longer throws when it shows the correct answer.
`tessera validate` checks a single answer string the same way as an answer list. It errors on a bare `answers` attribute, on `answers={undefined}`, and on answers that are all blank.
The correct answer shown after a miss and reported to the LMS is trimmed and leaves out blank answers, matching the answers it grades against.
