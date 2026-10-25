---
'tessera-learn': patch
---

Framework CSS sits in the `tessera` cascade layer, so a plain rule in `styles/` overrides any built-in component style without matching its specificity. Element selectors and layered CSS in `styles/` now reach built-in components too, so a reset such as Tailwind's preflight strips their styling.
