---
'tessera-learn': patch
---

Split the course validator into smaller modules. `tessera validate --standard` now applies that standard to page checks even when `course.config.js` does not parse.
