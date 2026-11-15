---
'tessera-learn': patch
---

Screen readers announce `Sorting` and `Matching` as a group named by the question text.

`tessera a11y` now also fails on an `aria-label` on an element with no role, such as a plain `<div>`, when the element has text. Screen readers ignore the label.
