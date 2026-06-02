---
'tessera-learn': patch
'create-tessera': patch
---

Scaffolded root scripts now pass through to the CLI (`tessera dev`) instead of hardcoding the seed course. `pnpm dev <course>` runs the course you name, and a bare `pnpm dev` lists the available courses rather than silently running the seed.
