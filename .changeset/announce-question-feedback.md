---
'tessera-learn': patch
---

Screen readers now read question feedback when it appears. A standalone question moves keyboard focus to its result after the answer is checked, and back to the question after Try again. In a quiz in `immediate` feedback mode, Submit moves focus to the result, and the next Tab reaches Next Question or See Results, which come before Back in the Tab order. Moving to another question, the results or review puts keyboard focus on its heading ("Question 2 of 3", "Quiz Results"), instead of losing it. In Sorting, a selected card tells screen readers to choose a target, not to activate it again, and the targets are read as a list. Question buttons no longer submit a surrounding form. Arrow keys change page only while no control has focus, and never when a modifier is held or a widget already handled the key. Escape closes the sidebar from anywhere outside a dialog.

Standalone MultipleChoice has a Check button: picking an option, including with the arrow keys, no longer checks it. Enter selects the focused option, like Space, and keyboard focus is a dark ring instead of a blue one that looked like the selected border. MultipleChoice shows whether the answer was correct, and `correctFeedback` / `incorrectFeedback` appear once, below the options, unless the chosen option has its own `optionFeedback`.
