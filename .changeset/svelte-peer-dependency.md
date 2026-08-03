---
'tessera-learn': minor
'create-tessera': minor
---

Move `svelte` from `dependencies` to `peerDependencies` (`^5.56.0`).

Svelte is a singleton: `tessera-learn` ships uncompiled source, so the consumer's
compiler processes it and exactly one copy must exist in the tree. Declaring it as
a hard dependency let package managers install a second copy alongside the
consumer's — the Vite plugin would compile against one Svelte while course code
imported another, and Dependabot saw the two as unrelated packages to bump on
separate schedules.

Consumers scaffolded by `create-tessera` already declare `svelte` and need no
change. Projects that relied on `tessera-learn` supplying Svelte transitively must
now add it themselves:

```bash
pnpm add -D svelte
```
