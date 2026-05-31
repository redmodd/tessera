---
'tessera-learn': patch
---

`RevealModal` now uses the native `<dialog>` element for focus containment, Escape-to-close, and backdrop, replacing the hand-rolled focus trap and scroll-lock. Public props and styling are unchanged.
