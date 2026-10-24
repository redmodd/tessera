---
'tessera-learn': patch
---

Screen readers now read question feedback when it appears. A standalone question moves keyboard focus to its result after the answer is checked, and back to the question after Try again. A quiz in `immediate` feedback mode announces each result through a status region. A selected Sorting card tells screen readers to choose a target, not to activate it again.

Standalone MultipleChoice has a Check button: picking an option, including with the arrow keys, no longer checks it. MultipleChoice shows whether the answer was correct, and `correctFeedback` / `incorrectFeedback` appear once, below the options.
