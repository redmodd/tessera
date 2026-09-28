---
'tessera-learn': patch
---

Each LMS adapter detects its own launch through a static `connect()`, replacing the separate discovery helpers. An xAPI launch whose `auth` parameter carries no credential now fails at launch instead of sending unauthenticated requests. SCORM API discovery skips a same-named global that is not an LMS API (such as an element with `id="API"`) and keeps searching up the frame chain.
