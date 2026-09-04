---
'tessera-learn': patch
---

Report a quiz answer when it becomes final (immediate-mode reveal, or submit) rather than on the option click, and label the quiz nav buttons for what the click does. Submit is now gated on every answer being fully built, so a half-finished matching, sorting or fill-in answer can no longer be submitted. Under the default `feedbackMode: 'review'` this means interactions reach the LMS only at submit, superseding the per-click writes added in 0.0.9.
