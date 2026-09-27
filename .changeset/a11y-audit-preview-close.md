---
'tessera-learn': patch
---

`runAudit` now fully closes its preview server, so it no longer leaves a SIGTERM handler behind that can exit the calling process.
