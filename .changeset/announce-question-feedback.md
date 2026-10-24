---
'tessera-learn': patch
---

Screen readers now read question feedback: checking an answer moves keyboard focus to the result, and Try again moves it back to the question. In a quiz, `immediate` feedback takes focus after Submit, and moving to another question, review or the results focuses its heading.
Standalone MultipleChoice has a Check button, so picking an option no longer checks it. Enter selects an option, focus has its own ring, and the result shows a Correct / Incorrect line.
A selected Sorting card tells screen readers to choose a target, and its targets read as a list.
Question buttons no longer submit a surrounding form.
Arrow keys change page only while no control has focus and no modifier is held. Escape closes the sidebar from anywhere outside a dialog.
Every question widget styles its result line with `.tessera-question-result` and its `correctFeedback` / `incorrectFeedback` text with `.tessera-question-feedback`. These replace the `.tessera-fitb-`, `.tessera-matching-` and `.tessera-sorting-` `result` and `feedback` classes, and `.tessera-mc-overall-feedback`.
