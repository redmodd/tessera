---
'tessera-learn': patch
---

Screen readers announce `Sorting` and `Matching` as a group named by the question text.

`tessera a11y` now fails on an `aria-label` on an element with no role, which axe only lists for review when the element has text.
