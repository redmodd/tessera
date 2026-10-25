---
'tessera-learn': minor
---

**Behavior change:** every standalone question shows a Submit button, disabled until the answer is complete. MultipleChoice no longer checks the answer when an option is picked, nor Matching when the last pair is matched, so learners press Submit. Sorting shows its button from the start, and the FillInTheBlank and Sorting buttons read "Submit". Question results use the same top spacing in every widget.

**Breaking:** the question widgets share new class names, so custom CSS aimed at the old ones stops applying. To upgrade, rename them:

- `.tessera-fitb-check-btn` and `.tessera-sorting-check` → `.tessera-question-submit`. The `.tessera-sorting-actions` wrapper is gone.
- `.tessera-fitb-review`, `.tessera-matching-review` and `.tessera-sorting-review` → `.tessera-question-review`.
- `.tessera-fitb-result`, `.tessera-matching-result` and `.tessera-sorting-result` → `.tessera-question-result`.
- `.tessera-fitb-feedback`, `.tessera-matching-feedback`, `.tessera-sorting-feedback` and `.tessera-mc-overall-feedback` → `.tessera-question-feedback`.
- The `.tessera-fitb-input-wrapper` div is gone.
