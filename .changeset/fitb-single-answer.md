---
'tessera-learn': patch
---

`<FillInTheBlank>` given a single answer string no longer throws when it shows the correct answer.
`tessera validate` checks a single answer string the same way as an answer list.
The correct answer shown after a miss is trimmed, matching the answer it grades against.
