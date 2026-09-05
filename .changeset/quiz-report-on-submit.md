---
'tessera-learn': patch
---

Report a quiz answer when it becomes final (immediate-mode reveal, or submit) rather than on the option click, gate submit on every answer being fully built, and label the quiz nav buttons for what the click does. An abandoned attempt in review/never mode now leaves no interaction records, and standalone `useQuestion` reports `answerComplete: false` until an answer is set.
