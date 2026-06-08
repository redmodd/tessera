---
'tessera-learn': patch
'create-tessera': patch
---

Restore npm publish provenance under pnpm 11. pnpm 11 stopped reading non-auth settings from `.npmrc`, so the repo's `provenance=true` was being ignored; provenance is now declared via `publishConfig.provenance` in each package instead.
