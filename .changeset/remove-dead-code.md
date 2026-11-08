---
'tessera-learn': minor
---

**Breaking:** the xAPI client from `useXAPI()` no longer has the undocumented `getPublishers()` method. To upgrade, remove calls to it and use the client's own methods, such as `getActor()`.
