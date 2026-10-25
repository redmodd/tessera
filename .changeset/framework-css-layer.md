---
'tessera-learn': minor
---

Framework CSS sits in the `tessera` cascade layer, so a plain rule in `styles/` overrides any built-in component style without matching its specificity. Element selectors and layered CSS in `styles/` now reach built-in components too: target your own classes, and leave out resets such as Tailwind's preflight, which strips their styling.
