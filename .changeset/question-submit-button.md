---
'tessera-learn': patch
---

Every standalone question shows a Submit button, disabled until the answer is complete. MultipleChoice no longer checks the answer when an option is picked, nor Matching when the last pair is matched. Sorting shows its button from the start, and the FillInTheBlank and Sorting buttons read "Submit".
The buttons share one style, `.tessera-question-submit`, which replaces `.tessera-fitb-check-btn`, `.tessera-sorting-check` and the `.tessera-sorting-actions` wrapper. FillInTheBlank drops its `.tessera-fitb-input-wrapper` div.
Question results use the same top spacing in every widget, set by `.tessera-question-review`, which replaces the `.tessera-fitb-`, `.tessera-matching-` and `.tessera-sorting-` `review` classes.
