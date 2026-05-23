---
"create-tessera": patch
---

Pin scaffolded and upgraded `tessera-learn` to the version create-tessera ships
at, derived from the package's own version, instead of a hand-maintained
`tesseraVersion` field. create-tessera and tessera-learn now release in lockstep
(changesets `fixed`), so the pinned runtime version can no longer drift from
what was published.
