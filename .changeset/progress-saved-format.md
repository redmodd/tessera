---
'tessera-learn': patch
---

Resume skips saved progress for pages the course does not have, and restores a corrupted quiz attempt count as one. `goToIndex` and a saved bookmark ignore a page index that is not a whole number.
