---
'tessera-learn': minor
---

**Breaking:** element selectors and layered CSS in `styles/` now reach built-in components, so a reset such as Tailwind's preflight strips their styling. To upgrade, leave preflight out and scope element rules such as `button { … }` to your own classes.

Framework CSS sits in the `tessera` cascade layer, so a plain rule in `styles/` overrides any built-in component style without matching its specificity.
