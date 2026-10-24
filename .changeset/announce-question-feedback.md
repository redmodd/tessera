---
'tessera-learn': patch
---

Screen readers now announce question feedback: focus moves to the result after submitting an answer, and back to the question on Try again.
Standalone MultipleChoice has a Submit button, so picking an option no longer checks it.
Arrow keys change page only when no control has focus, and Escape closes the sidebar from anywhere outside a dialog.
Question widgets style their result line with `.tessera-question-result` and their feedback text with `.tessera-question-feedback`. These replace the `.tessera-fitb-`, `.tessera-matching-` and `.tessera-sorting-` `result` and `feedback` classes, and `.tessera-mc-overall-feedback`.
