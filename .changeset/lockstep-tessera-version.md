---
'create-tessera': patch
---

Pin scaffolded and upgraded `tessera-learn` to the exact version create-tessera
ships at, derived from the package's own version, instead of a hand-maintained
`tesseraVersion` field. create-tessera and tessera-learn now release in lockstep
(changesets `fixed`), so the pinned runtime version always matches what was
published and cannot drift.
