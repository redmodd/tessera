---
'create-tessera': patch
---

Scaffolded workspaces now derive their Svelte pin from `tessera-learn` at build time (the two release in lockstep), so the pin can't drift when `tessera-learn`'s Svelte dependency is bumped.
