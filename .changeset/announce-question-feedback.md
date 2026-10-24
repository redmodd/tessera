---
'tessera-learn': patch
---

Screen readers now read question feedback when it appears. A standalone question moves keyboard focus to its result after the answer is checked, and back to the question after Try again. A quiz in `immediate` feedback mode announces each result through a status region, and focus stays on the button after Submit on the last question. In Sorting, a selected card tells screen readers to choose a target, not to activate it again, and the targets are read as a list. Question buttons no longer submit a surrounding form.

Standalone MultipleChoice has a Check button: picking an option, including with the arrow keys, no longer checks it. MultipleChoice shows whether the answer was correct, and `correctFeedback` / `incorrectFeedback` appear once, below the options, unless the chosen option has its own `optionFeedback`.
