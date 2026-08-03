---
'tessera-learn': patch
---

chore(deps-dev): bump the dev-dependencies group across 1 directory with 9 updates

`create-tessera`:

- `tsdown` 0.22.9 → 0.22.14

`tessera-learn`:

- `scorm-again` 3.0.5 → 3.2.0
- `svelte` 5.56.6 → 5.56.8
- `tsdown` 0.22.9 → 0.22.14

`scorm-again` 3.1.0 corrected the SCORM 1.2 out-of-range score error to 405 (407 is not in the 1.2 RTE error table), so the conformance test asserts 405.
