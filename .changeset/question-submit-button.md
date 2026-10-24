---
'tessera-learn': patch
---

Standalone FillInTheBlank and Sorting buttons read "Submit". The standalone MultipleChoice, FillInTheBlank and Sorting buttons share one style, `.tessera-question-submit`, which replaces `.tessera-fitb-check-btn`, `.tessera-sorting-check` and the `.tessera-sorting-actions` wrapper.
Sorting shows its Submit button from the start, disabled until every card is placed, like MultipleChoice and FillInTheBlank.
Question results use the same top spacing in every widget, set by `.tessera-question-review`, which replaces the `.tessera-fitb-`, `.tessera-matching-` and `.tessera-sorting-` `review` classes.
