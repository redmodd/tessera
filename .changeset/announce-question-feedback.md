---
'tessera-learn': patch
---

Screen readers now read question feedback when it appears. A standalone question moves keyboard focus to its result after the answer is checked, and back to the question after Try again. A quiz in `immediate` feedback mode announces each result through a status region.

Standalone MultipleChoice has a Check button: picking an option, including with the arrow keys, no longer checks it. MultipleChoice states whether the answer was correct, and shows `correctFeedback` / `incorrectFeedback` once, below the options.
