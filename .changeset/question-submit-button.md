---
'tessera-learn': minor
---

Every standalone question shows a Submit button, disabled until the answer is complete. MultipleChoice no longer checks the answer when an option is picked, nor Matching when the last pair is matched. Sorting shows its button from the start, and the FillInTheBlank and Sorting buttons read "Submit". Question results use the same top spacing in every widget.

Custom CSS that targets question widgets needs updating. The widgets share these classes:

- `.tessera-question-submit` replaces `.tessera-fitb-check-btn`, `.tessera-sorting-check` and the `.tessera-sorting-actions` wrapper.
- `.tessera-question-review` replaces the `.tessera-fitb-`, `.tessera-matching-` and `.tessera-sorting-` `review` classes.
- `.tessera-question-result` replaces the `.tessera-fitb-`, `.tessera-matching-` and `.tessera-sorting-` `result` classes.
- `.tessera-question-feedback` replaces the `.tessera-fitb-`, `.tessera-matching-` and `.tessera-sorting-` `feedback` classes, and `.tessera-mc-overall-feedback`.
- FillInTheBlank drops its `.tessera-fitb-input-wrapper` div.
