---
'tessera-learn': patch
---

An xAPI launch whose `auth` parameter carries no credential now fails at launch instead of sending unauthenticated requests. SCORM API discovery no longer stops at a same-named global that isn't the LMS API, such as an element with `id="API"`.
