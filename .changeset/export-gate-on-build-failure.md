---
'tessera-learn': patch
---

Skip export packaging and the asset copy when the build fails, including a failed `build --watch` rebuild, so a failed run leaves the previous zip in place.
